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
  const c = chain || 'ethereum';
  if (!SUPPORTED_CHAINS.has(c)) {
    logError(`[Alchemy] Unsupported chain: ${c}`);
    return null;
  }
  if (!ALCHEMY_KEY) {
    logError(`[Alchemy] Missing API key`);
    return null;
  }
  return ALCHEMY_URLS[c];
}

function osHeaders() {
  return OPENSEA_KEY ? { 'x-api-key': OPENSEA_KEY } : {};
}

export async function safeFetch(url, options = {}) {
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

// ----- Alchemy fallback helper (supply only) -----
async function alchemyFetchTotalSupply(contract, chain = 'ethereum') {
  const baseUrl = getAlchemyUrl(chain);
  if (!baseUrl) return null;

  const metaUrl = `${baseUrl}/getContractMetadata?contractAddress=${contract}`;
  try {
    const meta = await safeFetch(metaUrl);
    const supply = meta?.contractMetadata?.totalSupply;
    return (supply !== undefined && supply !== null) ? String(supply) : null;
  } catch (err) {
    logError(`[Fallback] Alchemy supply error for ${contract} on ${chain}: ${err.message}`);
    return null;
  }
}

// ========== OpenSea: collection stats ==========
export async function fetchCollectionStats(slugOrContract, chain = 'ethereum') {
  try {
    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(slugOrContract);
    let stats = null;
    let imageUrl = null;
    let externalUrl = null;

    if (OPENSEA_KEY) {
      if (isAddress) {
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
        const statsUrl = `https://api.opensea.io/api/v2/collections/${slugOrContract}/stats`;
        stats = await safeFetch(statsUrl, { headers: osHeaders() }).catch(() => null);

        const metaUrl = `https://api.opensea.io/api/v2/collections/${slugOrContract}`;
        const meta = await safeFetch(metaUrl, { headers: osHeaders() }).catch(() => null);
        imageUrl = meta?.image_url || null;
        externalUrl = meta?.external_url || null;
      }
    }

    if (stats) {
      const tokenCount =
        stats?.total?.supply ??
        stats?.total?.token_count ??
        null;

      const floorDecimal =
        (typeof stats?.total?.floor_price === 'number')
          ? stats.total.floor_price
          : (typeof stats?.total?.floor_price?.value === 'number'
              ? stats.total.floor_price.value
              : null);

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
    }

    if (isAddress) {
      logInfo(`[Fallback] Using Alchemy for supply of ${slugOrContract} on ${chain}`);
      const alchemySupply = await alchemyFetchTotalSupply(slugOrContract, chain);
      return {
        collections: [
          {
            tokenCount: alchemySupply != null ? String(alchemySupply) : null,
            floorAsk: null,
            image: null,
            externalUrl: null,
          },
        ],
      };
    }

    return { collections: [] };
  } catch (err) {
    logError(`OpenSea stats error: ${err.message}`);
    return { collections: [] };
  }
}

// ========== Alchemy: ownership ==========
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

// ========== Alchemy: wallet NFTs ==========
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

// ========== Alchemy: generic asset transfers ==========
export async function alchemyGetAssetTransfers({
  fromBlock = '0x0',
  toBlock = 'latest',
  fromAddress,
  toAddress,
  contract,
  tokenId,
  category = ['erc721', 'erc1155'],
  chain = 'ethereum',
  maxCount = 5,
}) {
  const baseUrl = getAlchemyUrl(chain);
  if (!baseUrl) return [];

  const url = `${baseUrl.replace('/nft/', '/v2/')}/getAssetTransfers`;
  const body = {
    fromBlock,
    toBlock,
    category,
    maxCount: `0x${maxCount.toString(16)}`,
    withMetadata: true,
  };
  if (fromAddress) body.fromAddress = fromAddress;
  if (toAddress) body.toAddress = toAddress;
  if (contract) body.contractAddresses = [contract];

  try {
    const data = await safeFetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    let transfers = data?.result?.transfers || [];
    if (tokenId) {
      transfers = transfers.filter(tx => tx?.erc721TokenId === tokenId || tx?.erc1155Metadata?.some(m => m.tokenId === tokenId));
    }
    return transfers;
  } catch (err) {
    logError(`[Alchemy] AssetTransfers error for ${contract || 'all'} on ${chain}: ${err.message}`);
    return [];
  }
}

// ========== Alchemy: recent transfers (mint txs only) ==========
export async function alchemyGetRecentTransfers(contract, chain = 'ethereum', limit = 5) {
  return alchemyGetAssetTransfers({
    fromAddress: "0x0000000000000000000000000000000000000000",
    contract,
    chain,
    maxCount: limit,
  });
}
