import { getAllMonitors, updateMonitor } from '../db.js';
import { fetchCollectionStats, alchemyGetOwnersForContract } from '../utils/api.js';
import { EmbedBuilder } from 'discord.js';
import { sendToDiscord } from '../utils/discord.js';
import { logInfo, logError } from '../utils/logger.js';

const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID;

export async function runSupplyMonitor(monitor, client) {
  const { contractAddress, chain, threshold, name, slugOrContract, id, lastAlertRemaining } = monitor;

  try {
    // Step 1: Get stats
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

    // Step 2: Holders
    const ownersData = await alchemyGetOwnersForContract(contractAddress, chain);
    const currentSupply = ownersData?.ownerAddresses?.length || null;
    const remaining = totalSupply !== null && currentSupply !== null
      ? totalSupply - currentSupply
      : null;

    // Step 3: Alert logic
    if (remaining !== null && threshold !== null && remaining <= threshold) {
      if (lastAlertRemaining !== remaining) {
        logInfo(`[${name}] Threshold reached! Remaining: ${remaining}`);

        const embed = new EmbedBuilder()
          .setTitle(`⚡ Supply Threshold Reached: ${name}`)
          .setDescription(`The collection **${name}** on **${chain}** has hit the alert threshold.`)
          .addFields(
            { name: 'Contract', value: `\`${contractAddress}\`` },
            { name: 'Total Supply', value: totalSupply?.toString() || 'N/A', inline: true },
            { name: 'Remaining', value: remaining?.toString() || 'N/A', inline: true },
            { name: 'Threshold', value: threshold?.toString() || 'N/A', inline: true },
            floorPrice !== null ? { name: 'Floor Price', value: `${floorPrice} ETH`, inline: true } : null,
            marketplaceUrl ? { name: 'Marketplace', value: `[View Collection](${marketplaceUrl})` } : null
          )
          .setColor(0xe74c3c)
          .setTimestamp();

        if (imageUrl) embed.setThumbnail(imageUrl);

        // ✅ Send to alert channel
        const sent = await sendToDiscord(client, ALERT_CHANNEL_ID, { embeds: [embed] });

        if (sent) {
          logInfo(`[${name}] Discord alert sent ✅`);
          await updateMonitor(id, { lastAlertRemaining: remaining });
        } else {
          logError(`[${name}] Failed to send Discord alert ❌`);
        }
      }
    }
  } catch (err) {
    // ⬇️ Log full error details for debugging
    logError(`[${name}] Monitor error: ${err.message}`);
    if (err?.stack) logError(err.stack);
    if (err?.code) logError(`[${name}] Discord error code: ${err.code}`);
    if (err?.rawError) logError(`[${name}] Discord raw error: ${JSON.stringify(err.rawError)}`);
  }
}

export async function runAllMonitors(client) {
  const monitors = getAllMonitors();
  if (!monitors.length) return;
  await Promise.all(monitors.map((m) => runSupplyMonitor(m, client)));
}

export function monitorTasks(client) {
  runAllMonitors(client); // initial run
  setInterval(() => runAllMonitors(client), 30_000);
}
