// commands/monitorsupply.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllMonitors, updateMonitor } from '../db.js';
import { fetchCollectionStats } from '../utils/api.js';

export const data = new SlashCommandBuilder()
  .setName('monitorsupply')
  .setDescription('Get current supply info for all monitors');

export async function execute(interaction) {
  const monitors = getAllMonitors();

  if (monitors.length === 0) {
    return interaction.reply({
      content: '❌ No monitors found.',
      flags: 1 << 6,
    });
  }

  let description = '';
  const alerts = [];

  for (const monitor of monitors) {
    // normalize monitor fields
    const id = monitor.id;
    const name = monitor.name || 'Unnamed';
    const contract = monitor.contract || monitor.contractAddress; // support old entries
    const chain = monitor.chain || 'ethereum';
    const threshold = monitor.threshold ?? null;
    const alerted = monitor.alerted ?? false;

    try {
      const stats = await fetchCollectionStats(contract, chain);
      if (stats?.collections?.length) {
        const col = stats.collections[0];
        const tokenCount = parseInt(col.tokenCount || 0, 10);
        const floor = col.floorAsk?.price?.amount?.decimal?.toString() || 'N/A';

        description += `**${name}** (${chain})\n🔗 \`${contract}\`\nSupply: **${tokenCount}** / Threshold: **${threshold ?? 'N/A'}**\nFloor: ${floor} ETH\n\n`;

        // Threshold alert check
        if (threshold && tokenCount >= threshold && !alerted) {
          alerts.push(`🚨 **${name}** on ${chain} has reached supply **${tokenCount}** (threshold: ${threshold})!`);
          updateMonitor(id, { alerted: true });
        }
      } else {
        description += `**${name}** (${chain})\n🔗 \`${contract}\`\nNo stats found\n\n`;
      }
    } catch (err) {
      description += `**${name}** (${chain})\n🔗 \`${contract}\`\n⚠️ Error fetching data\n\n`;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('Monitors Supply Info')
    .setDescription(description)
    .setColor('#00AAFF')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  // Send threshold alerts separately
  for (const alert of alerts) {
    await interaction.channel.send(alert);
  }
}
