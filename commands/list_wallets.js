// commands/list_wallets.js
import { SlashCommandBuilder } from 'discord.js';
import { getAllWallets } from '../db.js';
import { EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('list_wallets')
  .setDescription('List all tracked wallets');

export async function execute(interaction) {
  const wallets = getAllWallets();
  if (!wallets.length) {
    return interaction.reply({ content: 'No wallets tracked yet.'});
  }

  const embed = new EmbedBuilder()
    .setTitle('📋 Tracked Wallets')
    .setColor('#0099ff')
    .setTimestamp();

  for (const w of wallets) {
    embed.addFields({ name: w.address, value: `Chains: ${w.chains?.join(', ') || 'ethereum'}`, inline: false });
  }

  await interaction.reply({ embeds: [embed]});
}
