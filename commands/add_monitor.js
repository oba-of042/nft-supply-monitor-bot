// commands/add_monitor.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { sendToDiscord } from '../utils/discord.js';
import { addMonitor, getAllMonitors } from '../db.js';

const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID;

export const data = new SlashCommandBuilder()
  .setName('add_monitor')
  .setDescription('Add a new NFT monitor')
  .addStringOption(option =>
    option.setName('name')
      .setDescription('Monitor name')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('contract')
      .setDescription('NFT contract address')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('chain')
      .setDescription('Blockchain to monitor')
      .setRequired(true)
      .addChoices(
        { name: 'Ethereum', value: 'ethereum' },
        { name: 'Polygon', value: 'polygon' },
        { name: 'Arbitrum', value: 'arbitrum' },
        { name: 'Base', value: 'base' },
        { name: 'Optimism', value: 'optimism' }
      )
  )
  .addIntegerOption(option =>
    option.setName('threshold')
      .setDescription('Alert when supply reaches this number')
      .setRequired(true)
  );

export async function execute(interaction) {
  const name = interaction.options.getString('name');
  const contractAddress = interaction.options.getString('contract');
  const chain = interaction.options.getString('chain');
  const threshold = interaction.options.getInteger('threshold');

  // Prevent duplicate by name
  const existing = getAllMonitors().find(m => m.name === name);
  if (existing) {
    return interaction.reply({
      content: `❌ Monitor **${name}** already exists.`,
      ephemeral: true,
    });
  }

  addMonitor({ name, contractAddress, chain, threshold });

  const embed = new EmbedBuilder()
    .setTitle('✅ Monitor Added')
    .addFields(
      { name: 'Name', value: name, inline: true },
      { name: 'Contract', value: contractAddress, inline: true },
      { name: 'Chain', value: chain, inline: true },
      { name: 'Threshold', value: threshold.toString(), inline: true }
    )
    .setColor(0x2ecc71)
    .setTimestamp();

  // reply to the user in Discord
  await interaction.reply({
    content: `✅ Monitor **${name}** added successfully.`,
    ephemeral: true,
  });

  // also push notification embed to alert channel
  await sendToDiscord(interaction.client, ALERT_CHANNEL_ID, { embeds: [embed] });
}
