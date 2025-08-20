// commands/resetalerts.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllMonitors, updateMonitor } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('reset_alerts')
  .setDescription('Reset all monitor alerts so threshold checks will fire again');

export async function execute(interaction) {
  const monitors = getAllMonitors();
  if (!monitors.length) {
    const embed = new EmbedBuilder()
      .setTitle('Reset Alerts')
      .setDescription('❌ No monitors found.')
      .setColor('#FF0000')
      .setTimestamp();
    return interaction.reply({ embeds: [embed], flags: 1 << 6 });
  }

  let resetCount = 0;
  for (const m of monitors) {
    if (m.alerted) {
      updateMonitor(m.id, { alerted: false });
      resetCount++;
    }
  }

  let embed;
  if (resetCount > 0) {
    embed = new EmbedBuilder()
      .setTitle('🔄 Alerts Reset')
      .setDescription(`✅ Reset **${resetCount}** monitor(s).`)
      .addFields({
        name: 'Next Steps',
        value: 'Threshold alerts will fire again when conditions are met.',
        inline: false,
      })
      .setColor('#00AAFF')
      .setTimestamp();
  } else {
    embed = new EmbedBuilder()
      .setTitle('ℹ️ Nothing to Reset')
      .setDescription('No monitors had alerts set.')
      .setColor('#AAAAAA')
      .setTimestamp();
  }

  await interaction.reply({ embeds: [embed] });
}
