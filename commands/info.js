// commands/info.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getMonitorByName } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('info')
  .setDescription('Get detailed info about a monitor')
  .addStringOption(option =>
    option.setName('name').setDescription('Monitor name').setRequired(true));

export async function execute(interaction) {
  const name = interaction.options.getString('name');
  const monitor = getMonitorByName(name);

  if (!monitor) {
    return interaction.reply({
      content: `❌ Monitor "${name}" not found.`,
      flags: 1 << 6,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`Monitor Info: ${monitor.name}`)
    .addFields(
      { name: 'Contract Address', value: monitor.contractAddress || 'N/A', inline: true },
      { name: 'Threshold', value: monitor.threshold?.toString() || 'N/A', inline: true },
    )
    .setColor('#00AAFF')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
