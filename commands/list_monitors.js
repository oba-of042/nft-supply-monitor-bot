import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllMonitors } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('list_monitors')
  .setDescription('List all monitors');

export async function execute(interaction) {
  const monitors = getAllMonitors();

  if (monitors.length === 0) {
    return interaction.reply({
      content: '❌ No monitors found.',
      flags: 1 << 6,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('Monitors List')
    .setDescription(monitors.map(m => `${m.name} - ${m.contractAddress}`).join('\n'))
    .setColor('#0099ff')
    .setTimestamp();

  await interaction.reply({ embeds: [embed]});
}
