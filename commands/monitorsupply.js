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
    const { id, name, contractAddress, chain, threshold, alerted } = monitor;

    try {
      const stats = await fetchCollectionStats(contractAddress, chain || 'ethereum');
      if (stats?.collections?.length) {
        const col = stats.collections[0];
        const tokenCount = parseInt(col.tokenCount || 0, 10);
        const floor = col.floorAsk?.price?.amount?.decimal || 'N/A';

        description += `**${name}** (${chain})\n🔗 \`${contractAddress}\`\nSupply: **${tokenCount}** / Threshold: **${threshold ?? 'N/A'}**\nFloor: ${floor} ETH\n\n`;

        // Threshold alert check
        if (threshold && tokenCount >= threshold && !alerted) {
          alerts.push(`🚨 **${name}** on ${chain} has reached supply **${tokenCount}** (threshold: ${threshold})!`);
          updateMonitor(id, { alerted: true });
        }
      } else {
        description += `**${name}** (${chain})\n🔗 \`${contractAddress}\`\nNo stats found\n\n`;
      }
    } catch (err) {
      description += `**${name}** (${chain})\n🔗 \`${contractAddress}\`\n⚠️ Error fetching data\n\n`;
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
