import { SlashCommandBuilder } from 'discord.js';
import { getAllWallets } from '../db.js';
import { startWalletTracker } from '../utils/walletTracker.js';
import { EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('monitorwallets')
  .setDescription('Trigger wallet activity check manually');

export async function execute(interaction, client) {
  const wallets = getAllWallets();
  if (!wallets.length) {
    return interaction.reply({ content: 'No wallets tracked yet.'});
  }

  startWalletTracker(client); // will poll all chains

  const embed = new EmbedBuilder()
    .setTitle('🕵️‍♂️ Wallet Monitoring Started')
    .setDescription(`Monitoring **${wallets.length}** wallet(s) across multiple chains.`)
    .setColor('#0099ff')
    .setTimestamp();

  await interaction.reply({ embeds: [embed]});
}
