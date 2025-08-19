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

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return {};
      return res.json();
    })
  );
}

// ========== OpenSea + Alchemy: collection stats ==========
export async function fetchCollectionStats(slugOrContract, chain = 'ethereum') {
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
      // Contract lookup → get slug
      const contractUrl = `https://api.opensea.io/api/v2/chain/${chain}/contract/${slugOrContract}`;
      const contractRes = await safeFetch(contractUrl, { headers: osHeaders() }).catch(() => null);
      const slug = contractRes?.collection?.slug;

      if (slug) {
        const statsUrl = `https://api.opensea.io/api/v2/collections/${slug}/stats`;
        stats = await safeFetch(statsUrl, { headers: osHeaders() }).catch(() => null);

        const metaUrl = `https://api.opensea.io/api/v2/collections/${slug}`;
        const meta = await safeFetch(metaUrl, { headers: osHeaders() }).catch(() => null);
        imageUrl = meta?.image_url || null;
        externalUrl = meta?.external_url || null;
      }
    } else {
      // Slug directly
      const statsUrl = `https://api.opensea.io/api/v2/collections/${slugOrContract}/stats`;
      stats = await safeFetch(statsUrl, { headers: osHeaders() }).catch(() => null);

      const metaUrl = `https://api.opensea.io/api/v2/collections/${slugOrContract}`;
      const meta = await safeFetch(metaUrl, { headers: osHeaders() }).catch(() => null);
      imageUrl = meta?.image_url || null;
      externalUrl = meta?.external_url || null;
    }

    let tokenCount =
      stats?.total?.supply != null
        ? Number(stats.total.supply)
        : null;

    let floorDecimal =
      stats?.total?.floor_price != null
        ? Number(stats.total.floor_price)
        : null;

    // 🔥 Alchemy fallback if OpenSea gave nothing
    if (tokenCount == null) {
      logInfo(`[Fallback] Using Alchemy for supply of ${slugOrContract} on ${chain}`);
      try {
        const owners = await alchemyGetOwnersForContract(slugOrContract, chain);
        if (owners?.ownerAddresses) {
          tokenCount = owners.ownerAddresses.length;
        }
      } catch {
        tokenCount = null;
      }
    }

    return {
      collections: [
        {
          tokenCount: tokenCount != null ? String(tokenCount) : null,
          floorAsk: floorDecimal != null
            ? { price: { amount: { decimal: floorDecimal } } }
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
