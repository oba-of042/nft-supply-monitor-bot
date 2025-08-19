// utils/api.js
import fetch from 'node-fetch';
import { tokenBucket, concurrencyLimiter } from './rateLimiter.js';
import { withBackoff } from './backoff.js';
import { logError, logInfo } from './logger.js';

// ---- Keys & base URLs ----
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || '';
const OPENSEA_KEY = process.env.OPENSEA_API_KEY || '';

if (!ALCHEMY_KEY) console.warn('[NFT-MONITOR] Warning: ALCHEMY_API_KEY is not set in .env');
if (!OPENSEA_KEY) console.warn('[NFT-MONITOR] Warning: OPENSEA_API_KEY is not set in .env');

const ALCHEMY_URLS = {
  ethereum: `https://eth-mainnet.g.alchemy.com/nft/v2/${ALCHEMY_KEY}`,
  polygon:  `https://polygon-mainnet.g.alchemy.com/nft/v2/${ALCHEMY_KEY}`,
  arbitrum: `https://arb-mainnet.g.alchemy.com/nft/v2/${ALCHEMY_KEY}`,
  optimism: `https://opt-mainnet.g.alchemy.com/nft/v2/${ALCHEMY_KEY}`,
};

const SUPPORTED_CHAINS = new Set(Object.keys(ALCHEMY_URLS));

// ---- Helpers ----
function getAlchemyUrl(chain) {
  if (!SUPPORTED_CHAINS.has(chain)) {
    logError(`[Alchemy] Unsupported chain: ${chain}`);
    return null;
  }
  if (!ALCHEMY_KEY) {
    logError(`[Alchemy] Missing API key`);
    return null;
  }
  return ALCHEMY_URLS[chain];
}

function osHeaders() {
  return OPENSEA_KEY ? { 'x-api-key': OPENSEA_KEY } : {};
}

async function safeFetch(url, options = {}) {
  // Global limiter + exponential backoff
  await tokenBucket.acquire();
  return concurrencyLimiter.run(() =>
    withBackoff(async () => {
      let res;
      try {
        res = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
          },
        });
      } catch (err) {
        throw new Error(`Network error: ${err.message}`);
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${res.statusText} — ${text}`);
      }
      // Some OpenSea endpoints return no body on 204
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return {};
      return res.json();
    })
  );
}

// ========== OpenSea: collection stats (slug or contract) ==========
/**
 * Returns a Reservoir-like shape so upstream code doesn’t need to change.
 * {
 *   collections: [{
 *     tokenCount,
 *     floorAsk: { price: { amount: { decimal } } },
 *     image,
 *     externalUrl
 *   }]
 * }
 */
export async function fetchCollectionStats(slugOrContract, chain = 'ethereum') {
  // Prefer OpenSea. If it fails, return a benign empty shape.
  try {
    if (!OPENSEA_KEY) {
      logInfo('[OpenSea] No API key set; skipping collection stats.');
      return { collections: [] };
    }

    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(slugOrContract);
    let stats = null;
    let imageUrl = null;
    let externalUrl = null;

    if (isAddress) {
      // Try to derive the collection by contract, then stats by slug.
      // 1) Contract lookup
      // GET https://api.opensea.io/api/v2/chain/{chain}/contract/{address}
      // (Will try to read collection.slug from this)
      const contractUrl = `https://api.opensea.io/api/v2/chain/${chain}/contract/${slugOrContract}`;
      const contractRes = await safeFetch(contractUrl, { headers: osHeaders() }).catch(() => null);
      const slug = contractRes?.collection?.slug;

      // 2) Stats via slug if available
      if (slug) {
        const statsUrl = `https://api.opensea.io/api/v2/collections/${slug}/stats`;
        const s = await safeFetch(statsUrl, { headers: osHeaders() });
        stats = s || null;

        // Also try basic collection metadata for image/external link
        const metaUrl = `https://api.opensea.io/api/v2/collections/${slug}`;
        const meta = await safeFetch(metaUrl, { headers: osHeaders() }).catch(() => null);
        imageUrl = meta?.image_url || null;
        externalUrl = meta?.external_url || null;
      }
    } else {
      // Treat as slug directly
      const statsUrl = `https://api.opensea.io/api/v2/collections/${slugOrContract}/stats`;
      stats = await safeFetch(statsUrl, { headers: osHeaders() });

      const metaUrl = `https://api.opensea.io/api/v2/collections/${slugOrContract}`;
      const meta = await safeFetch(metaUrl, { headers: osHeaders() }).catch(() => null);
      imageUrl = meta?.image_url || null;
      externalUrl = meta?.external_url || null;
    }

    // Map to the expected shape (tolerate missing fields)
    const tokenCount =
      stats?.total?.supply ??
      stats?.total?.token_count ??
      null;

    const floorDecimal =
      stats?.total?.floor_price ??
      stats?.total?.floor_price?.value ??
      null;

    return {
      collections: [
        {
          tokenCount: tokenCount != null ? String(tokenCount) : null,
          floorAsk: floorDecimal != null
            ? { price: { amount: { decimal: Number(floorDecimal) } } }
            : null,
          image: imageUrl || null,
          externalUrl: externalUrl || null,
        },
      ],
    };
  } catch (err) {
    logError(`OpenSea stats error: ${err.message}`);
    return { collections: [] };
  }
}

// ========== Alchemy: ownership & wallet NFTs ==========
export async function alchemyGetOwnersForContract(contract, chain = 'ethereum') {
  const baseUrl = getAlchemyUrl(chain);
  if (!baseUrl) return { ownerAddresses: [] };

  const url = `${baseUrl}/getOwnersForContract?contractAddress=${contract}&withTokenBalances=false`;
  try {
    const data = await safeFetch(url);
    return data || { ownerAddresses: [] };
  } catch (err) {
    // Never throw; always return a safe shape
    if (/401/.test(err.message)) logError(`[Alchemy] Unauthorized on ${chain}. Check ALCHEMY_API_KEY.`);
    else if (/429/.test(err.message)) logError(`[Alchemy] Rate limited on ${chain}.`);
    else logError(`[Alchemy] Owners error on ${chain}: ${err.message}`);
    return { ownerAddresses: [] };
  }
}

export async function alchemyGetNFTsForOwner(owner, chain = 'ethereum') {
  const baseUrl = getAlchemyUrl(chain);
  if (!baseUrl) {
    logInfo(`[Alchemy] Skipping ${chain} for ${owner} (no API URL/key)`);
    return { ownedNfts: [] };
  }
  const url = `${baseUrl}/getNFTs/?owner=${owner}`;
  try {
    const data = await safeFetch(url);
    return data || { ownedNfts: [] };
  } catch (err) {
    if (/401/.test(err.message)) logError(`[Alchemy] Unauthorized for ${chain}.`);
    else if (/429/.test(err.message)) logError(`[Alchemy] Rate limited for ${chain}.`);
    else if (/5\d\d/.test(err.message)) logError(`[Alchemy] ${chain} server error: ${err.message}`);
    else logError(`[Alchemy] NFTsForOwner error for ${owner} on ${chain}: ${err.message}`);
    return { ownedNfts: [] };
  }
}
