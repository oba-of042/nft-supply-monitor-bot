// commands/remove_wallet.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { removeWallet } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('remove_wallet')
  .setDescription('Remove a tracked wallet by name or address')
  .addStringOption(option =>
    option
      .setName('identifier')
      .setDescription('Wallet name or address')
      .setRequired(true)
  );

export async function execute(interaction) {
  const identifier = interaction.options.getString('identifier').trim();
  const success = removeWallet(identifier);

  const embed = new EmbedBuilder()
    .setColor(success ? 0x00ff00 : 0xff0000)
    .setTitle(success ? '✅ Wallet Removed' : '❌ Wallet Not Found')
    .setDescription(
      success
        ? `Wallet **${identifier}** removed from tracking.`
        : `Wallet **${identifier}** was not found.`
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
