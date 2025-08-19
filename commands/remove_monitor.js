import { SlashCommandBuilder } from 'discord.js';
import { removeMonitor } from '../db.js';
import { EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('remove_monitor')
  .setDescription('Remove an NFT monitor')
  .addStringOption(option => option.setName('name').setDescription('Monitor name').setRequired(true));

export async function execute(interaction) {
  const name = interaction.options.getString('name');
  const success = removeMonitor(name);

  const embed = new EmbedBuilder()
    .setColor(success ? '#00FF00' : '#FF0000')
    .setTitle(success ? '✅ Monitor Removed' : '❌ Monitor Not Found')
    .setDescription(success ? `Monitor **${name}** removed.` : `Monitor **${name}** does not exist.`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed]});
}
