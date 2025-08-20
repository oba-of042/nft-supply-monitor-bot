// commands/add_wallet.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { addWallet, getAllWallets } from '../db.js';
import { logInfo, logError } from '../utils/logger.js';

const SUPPORTED_CHAINS = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'abstract'];

export default {
  data: new SlashCommandBuilder()
    .setName('add_wallet')
    .setDescription('Track a wallet for NFT activity')
    .addStringOption(option =>
      option.setName('address')
        .setDescription('Wallet address (0x...)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('chains')
        .setDescription(`Comma-separated chains (default: ethereum). Supported: ${SUPPORTED_CHAINS.join(', ')}`)
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      const address = interaction.options.getString('address').trim().toLowerCase();
      let chainsInput = interaction.options.getString('chains');

      // Basic validation
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        await interaction.reply({ content: '❌ Invalid wallet address.', ephemeral: true });
        return;
      }

      // Parse chains
      let chains = ['ethereum']; // default
      if (chainsInput) {
        chains = chainsInput
          .split(',')
          .map(c => c.trim().toLowerCase())
          .filter(c => SUPPORTED_CHAINS.includes(c));
      }
      if (!chains.length) chains = ['ethereum'];

      // Save wallet
      addWallet({ address, chains });
      logInfo(`Added wallet ${address} on chains [${chains.join(', ')}]`);

      // Embed confirmation
      const embed = new EmbedBuilder()
        .setTitle('👛 Wallet Tracking Enabled')
        .setDescription(`This wallet will now be monitored for NFT activity.`)
        .addFields(
          { name: 'Wallet Address', value: `\`${address}\`` },
          { name: 'Chains', value: chains.join(', ') }
        )
        .setColor(0x2ecc71)
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: false });
    } catch (err) {
      logError(`add_wallet failed: ${err.message}`);
      await interaction.reply({ content: '❌ Failed to add wallet.', ephemeral: true });
    }
  },
};
