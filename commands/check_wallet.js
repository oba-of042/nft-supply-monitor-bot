// commands/check_wallet.js
import { SlashCommandBuilder } from 'discord.js';
import { getAllWallets } from '../db.js';
import { alchemyGetNFTsForOwner } from '../utils/api.js';
import { EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('check_wallet')
  .setDescription('Check NFTs in a wallet')
  .addStringOption(option => option.setName('address').setDescription('Wallet address').setRequired(true));

export async function execute(interaction) {
  const address = interaction.options.getString('address');
  const wallet = getAllWallets().find(w => w.address.toLowerCase() === address.toLowerCase());
  if (!wallet) return interaction.reply({ content: `❌ Wallet ${address} not tracked.`});

  const embed = new EmbedBuilder()
    .setTitle(`📦 Wallet: ${address}`)
    .setColor('#0099ff')
    .setTimestamp();

  for (const chain of wallet.chains || ['ethereum']) {
    const nfts = await alchemyGetNFTsForOwner(address, chain);
    embed.addFields({
      name: `${chain.toUpperCase()} NFTs`,
      value: nfts?.ownedNfts?.length ? `${nfts.ownedNfts.length} NFTs` : '0 NFTs',
      inline: false,
    });
  }

  await interaction.reply({ embeds: [embed] });
}
