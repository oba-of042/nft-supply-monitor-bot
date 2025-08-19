 // monitors/monitorTasks.js
import {
  getAllMonitors,
  updateMonitor,
} from '../db.js'; // Import only what you need

import { fetchCollectionStats, alchemyGetOwnersForContract } from '../utils/api.js';
import { formatSupplyStatus } from '../utils/format.js';
import { sendToDiscord } from '../utils/discord.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Monitor a single collection for supply changes
 * @param {Object} monitor - Monitor object from database
 */
export async function runSupplyMonitor(monitor) {
  const { contractAddress, chain, threshold, name, slugOrContract, id, lastAlertRemaining } = monitor;

  try {
    // Step 1: Get collection stats (Reservoir)
    const stats = await fetchCollectionStats(slugOrContract || contractAddress, chain);
    if (!stats?.collections?.length) {
      logError(`[${name}] No stats found for ${contractAddress}`);
      return;
    }

    const collection = stats.collections[0];
    const totalSupply = collection.tokenCount ? parseInt(collection.tokenCount) : null;
    const floorPrice = collection.floorAsk?.price?.amount?.decimal || null;
    const imageUrl = collection.image || null;
    const marketplaceUrl = collection.externalUrl || null;

    // Step 2: Get current holders from Alchemy
    const ownersData = await alchemyGetOwnersForContract(contractAddress, chain);
    const currentSupply = ownersData?.ownerAddresses?.length || null;
    const remaining = totalSupply !== null && currentSupply !== null
      ? totalSupply - currentSupply
      : null;

    // Step 3: Threshold check
    if (remaining !== null && threshold !== null && remaining <= threshold) {
      // Prevent duplicate alerts — check if alert already sent
      if (lastAlertRemaining !== remaining) {
        logInfo(`[${name}] Threshold reached! Remaining: ${remaining}`);

        const embed = formatSupplyStatus({
          name,
          contract: contractAddress,
          totalSupply,
          remainingSupply: remaining,
          floorPrice,
          image: imageUrl,
          marketplace: marketplaceUrl,
        });

        await sendToDiscord(embed);

        // Update DB so we don't alert again until change
        await updateMonitor(id, { lastAlertRemaining: remaining });
      }
    }

  } catch (err) {
    logError(`[${name}] Monitor error: ${err.message}`);
  }
}

/**
 * Run all monitors in parallel
 */
export async function runAllMonitors() {
  const monitors = getAllMonitors();
  await Promise.all(monitors.map(m => runSupplyMonitor(m)));
}

// Wrapper to run monitors periodically (every 30s)
export function monitorTasks(client) {
  runAllMonitors(); // initial run
  setInterval(() => runAllMonitors(), 30_000);
}
