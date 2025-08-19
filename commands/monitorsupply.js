// commands/monitorsupply.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllMonitors } from '../db.js';
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
  for (const monitor of monitors) {
    try {
      const stats = await fetchCollectionStats(monitor.contractAddress, 'ethereum');
      if (stats?.collections?.length) {
        const col = stats.collections[0];
        description += `**${monitor.name}**: ${col.tokenCount} tokens, floor: ${col.floorAsk?.price?.amount?.decimal || 'N/A'} ETH\n`;
      } else {
        description += `**${monitor.name}**: No stats found\n`;
      }
    } catch {
      description += `**${monitor.name}**: Error fetching data\n`;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('Monitors Supply Info')
    .setDescription(description)
    .setColor('#00AAFF')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
