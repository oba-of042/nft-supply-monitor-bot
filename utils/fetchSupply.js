import { fetchCollectionStats, alchemyGetOwnersForContract } from './api.js';
import { logError } from './logger.js';

/**
 * Fetch supply details for a collection
 * @param {string} contractAddress - NFT contract address
 * @param {string} chain - Blockchain name (e.g. 'ethereum', 'polygon')
 * @returns {Promise<{ totalSupply: number, remaining: number }>}
 */
export async function fetchSupply(contractAddress, chain) {
  try {
    // Step 1: Get collection stats
    const stats = await fetchCollectionStats(contractAddress, chain);
    if (!stats?.collections?.length) {
      throw new Error(`No stats found for ${contractAddress}`);
    }

    const collection = stats.collections[0];
    const totalSupply = collection.tokenCount ? parseInt(collection.tokenCount) : null;

    // Step 2: Get holders count
    const ownersData = await alchemyGetOwnersForContract(contractAddress, chain);
    const currentSupply = ownersData?.ownerAddresses?.length || null;

    // Step 3: Calculate remaining supply
    const remaining = totalSupply !== null && currentSupply !== null
      ? totalSupply - currentSupply
      : null;

    return {
      totalSupply: totalSupply || 0,
      remaining: remaining || 0
    };

  } catch (err) {
    logError(`fetchSupply error: ${err.message}`);
    throw err;
  }
}
