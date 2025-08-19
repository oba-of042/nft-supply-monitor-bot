import { safeFetch } from './api.js';
import { logError } from './logger.js';

/**
 * Resolve IPFS URIs to a gateway link
 */
export function resolveIpfs(uri) {
  if (!uri) return null;
  if (uri.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${uri.replace('ipfs://', '')}`;
  }
  return uri;
}

/**
 * Fetch token metadata (from tokenURI)
 */
export async function fetchTokenMetadata(tokenUri) {
  try {
    const resolved = resolveIpfs(tokenUri);
    if (!resolved) return null;
    return await safeFetch(resolved);
  } catch (err) {
    logError(`Metadata fetch error: ${err.message}`);
    return null;
  }
}

/**
 * Fetch NFT image URL from metadata
 */
export async function fetchTokenImage(tokenUri) {
  const metadata = await fetchTokenMetadata(tokenUri);
  if (!metadata) return null;
  return resolveIpfs(metadata.image || metadata.image_url || null);
}

/**
 * Fetch supply information for a given NFT contract
 * @param {string} contractAddress - The NFT contract address
 * @param {string} chain - The blockchain name
 * @returns {Promise<Object>} - Supply information
 */
export async function fetchSupplyInfo(contractAddress, chain) {
  try {
    // Replace with actual API call to fetch supply info
    const response = await safeFetch(`https://api.example.com/supply/${chain}/${contractAddress}`);
    return response; // Assuming response contains { totalSupply, maxSupply, remaining }
  } catch (err) {
    logError(`Supply info fetch error: ${err.message}`);
    throw err; // Rethrow to handle in command
  }
}

/**
 * Fetch NFTs held by a wallet
 * @param {string} walletAddress - The wallet address
 * @param {string} chain - The blockchain name
 * @returns {Promise<Array>} - List of NFTs
 */
export async function fetchWalletNFTs(walletAddress, chain) {
  try {
    // Replace with actual API call to fetch NFTs for the wallet
    const response = await safeFetch(`https://api.example.com/nfts/${chain}/${walletAddress}`);
    return response.ownedNfts || []; // Assuming response contains an array of NFTs
  } catch (err) {
    logError(`Wallet NFTs fetch error: ${err.message}`);
    throw err; // Rethrow to handle in command
  }
}
