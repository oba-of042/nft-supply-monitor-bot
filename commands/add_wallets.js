// commands/add_wallet.js
import { SlashCommandBuilder } from 'discord.js';
import { addWallet, getAllWallets } from '../db.js';
import { EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('add_wallets')
  .setDescription('Add a wallet to track')
  .addStringOption(option => option.setName('address').setDescription('Wallet address').setRequired(true))
  .addStringOption(option => option.setName('chains').setDescription('Comma-separated chains (ethereum, polygon, arbitrum)').setRequired(false));

export async function execute(interaction) {
  const address = interaction.options.getString('address');
  const chainsInput = interaction.options.getString('chains') || 'ethereum';
  const chains = chainsInput.split(',').map(c => c.trim().toLowerCase());

  const existing = getAllWallets().find(w => w.address.toLowerCase() === address.toLowerCase());
  if (existing) {
    return interaction.reply({ content: `❌ Wallet ${address} is already tracked.`});
  }

  addWallet({ address, chains });

  const embed = new EmbedBuilder()
    .setTitle('✅ Wallet Added')
    .setDescription(`Wallet **${address}** is now tracked.`)
    .addFields({ name: 'Chains', value: chains.join(', '), inline: true })
    .setColor('#00FF00')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
