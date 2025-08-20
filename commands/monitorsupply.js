// commands/monitorsupply.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllMonitors, updateMonitor } from '../db.js';
import { fetchCollectionStats } from '../utils/api.js';

export const data = new SlashCommandBuilder()
  .setName('monitorsupply')
  .setDescription('Get current supply info for all monitors');

export async function execute(interaction) {
  const monitors = getAllMonitors();

  if (monitors.length === 0) {
    return interaction.reply({
      content: '❌ No monitors found.',
      flags: 1 << 6,
    });
  }

  const embeds = [];
  const alerts = [];

  for (const monitor of monitors) {
    const { id, name, contractAddress, chain, threshold, alerted } = monitor;

    try {
      const stats = await fetchCollectionStats(contractAddress, chain || 'ethereum');
      let description;
      let thumbnail = null;
      let url = null;

      if (stats?.collections?.length) {
        const col = stats.collections[0];

        // Safe numeric parsing
        const rawTokenCount = parseInt(col.tokenCount || 0, 10);
        const tokenCount = Math.max(rawTokenCount, 0); // never negative
        const floor = col.floorAsk?.price?.amount?.decimal ?? 'N/A';

        description =
          `Supply: **${tokenCount}** / Threshold: **${threshold ?? 'N/A'}**\n` +
          `Floor: ${floor} ETH`;

        thumbnail = col.image || null;
        url = col.externalUrl || null;

        // Threshold alert check
        if (threshold && tokenCount >= threshold && !alerted) {
          alerts.push({
            id,
            name,
            chain,
            contractAddress,
            tokenCount,
            threshold,
          });
          updateMonitor(id, { alerted: true });
        }
      } else {
        description = '⚠️ No stats found';
      }

      const embed = new EmbedBuilder()
        .setTitle(`${name} (${chain})`)
        .setDescription(description)
        .setColor('#00AAFF')
        .setTimestamp()
        .addFields({ name: 'Contract', value: contractAddress, inline: false });

      if (thumbnail) embed.setThumbnail(thumbnail);
      if (url) embed.setURL(url);

      embeds.push(embed);
    } catch (err) {
      const embed = new EmbedBuilder()
        .setTitle(`${monitor.name} (${monitor.chain})`)
        .setDescription(`⚠️ Error fetching data\n\`\`\`${err.message}\`\`\``)
        .setColor('#FF0000')
        .setTimestamp()
        .addFields({ name: 'Contract', value: monitor.contractAddress, inline: false });

      embeds.push(embed);
    }
  }

  // Reply with all supply embeds in one message
  await interaction.reply({ embeds });

  // Send threshold alerts as rich embeds
  for (const alert of alerts) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('🚨 Threshold Reached')
        .setDescription(`**${alert.name}** on **${alert.chain}** has hit threshold!`)
        .addFields(
          { name: 'Contract', value: `\`${alert.contractAddress}\``, inline: false },
          { name: 'Current Supply', value: `${alert.tokenCount}`, inline: true },
          { name: 'Threshold', value: `${alert.threshold}`, inline: true }
        )
        .setColor('#FF0000')
        .setTimestamp();

      await interaction.channel.send({ embeds: [embed] });
      console.log(
        `[NFT-MONITOR] [ALERT] Sent threshold alert for ${alert.name} (${alert.chain})`
      );
    } catch (err) {
      console.error('Discord send error (threshold alert):', err);
    }
  }
}
