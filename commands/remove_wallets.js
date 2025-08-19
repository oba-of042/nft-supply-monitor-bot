import { SlashCommandBuilder } from 'discord.js';
import { removeWallet } from '../db.js';
import { EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('remove_wallets')
  .setDescription('Remove a tracked wallet')
  .addStringOption(option => option.setName('address').setDescription('Wallet address').setRequired(true));

export async function execute(interaction) {
  const address = interaction.options.getString('address');
  const success = removeWallet(address);

  const embed = new EmbedBuilder()
    .setColor(success ? '#00FF00' : '#FF0000')
    .setTitle(success ? '✅ Wallet Removed' : '❌ Wallet Not Found')
    .setDescription(success ? `Wallet **${address}** removed from tracking.` : `Wallet **${address}** was not tracked.`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

