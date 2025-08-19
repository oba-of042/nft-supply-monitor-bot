// commands/add_monitor.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { addMonitor, getAllMonitors } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('add_monitor')
  .setDescription('Add a new NFT monitor')
  .addStringOption(option =>
    option
      .setName('name')
      .setDescription('Monitor name')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('contract')
      .setDescription('NFT contract address')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('chain')
      .setDescription('Blockchain network (ethereum, polygon, base, etc.)')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName('threshold')
      .setDescription('Threshold supply count for alerts')
      .setRequired(true)
  );

export async function execute(interaction) {
  const name = interaction.options.getString('name');
  const contract = interaction.options.getString('contract');
  const chain = interaction.options.getString('chain');
  const threshold = interaction.options.getInteger('threshold');

  const existing = getAllMonitors().find(m => m.name === name);
  if (existing) {
    return interaction.reply({
      content: `❌ Monitor with name **${name}** already exists.`,
      flags: 1 << 6, // ephemeral
    });
  }

  const monitor = {
    id: Date.now().toString(),
    name,
    contractAddress: contract,
    chain,
    threshold,
    alerted: false, // used in monitorsupply.js
  };

  addMonitor(monitor);

  const embed = new EmbedBuilder()
    .setTitle('✅ Monitor Added')
    .setDescription(
      `Monitor **${name}** added:\n\n🔗 Contract: \`${contract}\`\n🌐 Chain: ${chain}\n📊 Threshold: ${threshold}`
    )
    .setColor('#00FF00')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
