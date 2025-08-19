// commands/list_monitors.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllMonitors } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('list_monitors')
  .setDescription('List all monitors');

export async function execute(interaction) {
  const monitors = getAllMonitors();

  if (monitors.length === 0) {
    return interaction.reply({
      content: '❌ No monitors found.',
      flags: 1 << 6,
    });
  }

  const description = monitors
    .map(m => {
      return `**${m.name}**  
🔗 Contract: \`${m.contractAddress}\`  
🌐 Chain: ${m.chain || 'ethereum'}  
📊 Threshold: ${m.threshold ?? 'Not set'}  
🚨 Alerted: ${m.alerted ? 'Yes' : 'No'}`;
    })
    .join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle('📋 Monitors List')
    .setDescription(description)
    .setColor('#0099ff')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
