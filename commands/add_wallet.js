// commands/add_wallet.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { addWallet } from '../db.js';
import { logInfo, logError } from '../utils/logger.js';
import { sendToDiscord } from '../utils/discord.js';

const SUPPORTED_CHAINS = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'abstract'];
const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID;

export const data = new SlashCommandBuilder()
  .setName('add_wallet')
  .setDescription('Track a wallet for NFT activity')
  .addStringOption(option =>
    option.setName('address').setDescription('Wallet address (0x...)').setRequired(true)
  )
  .addStringOption(option =>
    option.setName('chains').setDescription('Comma-separated chains (default: ethereum)').setRequired(false)
  );

export async function execute(interaction) {
  try {
    const address = interaction.options.getString('address').trim().toLowerCase();
    let chainsInput = interaction.options.getString('chains');

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      await interaction.reply({ content: '❌ Invalid wallet address.', flags: 1 << 6 });
      return;
    }

    let chains = ['ethereum'];
    if (chainsInput) {
      chains = chainsInput
        .split(',')
        .map(c => c.trim().toLowerCase())
        .filter(c => SUPPORTED_CHAINS.includes(c));
    }
    if (!chains.length) chains = ['ethereum'];

    addWallet({ address, chains });
    logInfo(`Added wallet ${address} on chains [${chains.join(', ')}]`);

    const embed = new EmbedBuilder()
      .setTitle('👛 Wallet Tracking Enabled')
      .setDescription(`This wallet will now be monitored for NFT activity.`)
      .addFields(
        { name: 'Wallet Address', value: `\`${address}\`` },
        { name: 'Chains', value: chains.join(', ') }
      )
      .setColor(0x2ecc71)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 1 << 6 });

    if (ALERT_CHANNEL_ID) {
      await sendToDiscord(interaction.client, ALERT_CHANNEL_ID, { embeds: [embed] });
    }
  } catch (err) {
    logError(`add_wallet failed: ${err.message}`);
    await interaction.reply({ content: '❌ Failed to add wallet.', flags: 1 << 6 });
  }
}
