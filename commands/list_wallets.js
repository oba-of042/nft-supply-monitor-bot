// commands/list_wallets.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllWallets } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('list_wallets')
  .setDescription('List all tracked wallets');

export async function execute(interaction) {
  const wallets = getAllWallets();
  if (!wallets.length) {
    return interaction.reply({ content: 'No wallets tracked yet.' });
  }

  const embed = new EmbedBuilder()
    .setTitle('📋 Tracked Wallets')
    .setColor('#0099ff')
    .setTimestamp();

  for (const w of wallets) {
    embed.addFields({
      name: w.name ? `${w.name} (${w.address})` : w.address,
      value: `Chains: ${w.chains?.join(', ') || 'ethereum'}`,
      inline: false,
    });
  }

  await interaction.reply({ embeds: [embed] });
}
