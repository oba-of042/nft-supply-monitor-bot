import { SlashCommandBuilder } from 'discord.js';
import { addMonitor, getAllMonitors } from '../db.js';
import { EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('add_monitor')
  .setDescription('Add a new NFT monitor')
  .addStringOption(option => option.setName('name').setDescription('Monitor name').setRequired(true))
  .addStringOption(option => option.setName('contract').setDescription('NFT contract address').setRequired(true));

export async function execute(interaction) {
  const name = interaction.options.getString('name');
  const contract = interaction.options.getString('contract');

  const existing = getAllMonitors().find(m => m.name === name);
  if (existing) {
    return interaction.reply({ content: `❌ Monitor ${name} already exists.`, });
  }

  addMonitor({ name, contract });

  const embed = new EmbedBuilder()
    .setTitle('✅ Monitor Added')
    .setDescription(`Monitor **${name}** added for contract **${contract}**.`)
    .setColor('#00FF00')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
