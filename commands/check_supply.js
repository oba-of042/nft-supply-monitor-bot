// commands/check_supply.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getMonitorByName } from '../db.js';
import { fetchCollectionStats } from '../utils/api.js';

export const data = new SlashCommandBuilder()
  .setName('check_supply')
  .setDescription('Check current supply status of a monitor')
  .addStringOption(option =>
    option.setName('name').setDescription('Monitor name').setRequired(true));

export async function execute(interaction) {
  const name = interaction.options.getString('name');
  const monitor = getMonitorByName(name);

  if (!monitor) {
    return interaction.reply({
      content: `❌ Monitor named "${name}" not found.`,
      flags: 1 << 6,
    });
  }

  try {
    const stats = await fetchCollectionStats(monitor.contractAddress, monitor.chain || 'ethereum');
    if (!stats?.collections?.length) {
      return interaction.reply({
        content: '❌ Failed to fetch collection stats.',
        flags: 1 << 6,
      });
    }

    const col = stats.collections[0];
    const totalSupply = col.tokenCount ?? 'N/A';
    const floorPrice = col.floorAsk?.price?.amount?.decimal ?? 'N/A';

    const embed = new EmbedBuilder()
      .setTitle(`Supply Info for ${monitor.name}`)
      .setColor('#0099ff')
      .setTimestamp()
      .addFields(
        { name: 'Contract', value: monitor.contractAddress, inline: false },
        { name: 'Chain', value: monitor.chain || 'ethereum', inline: true },
        { name: 'Total Supply', value: `${totalSupply}`, inline: true },
        { name: 'Floor Price', value: floorPrice.toString(), inline: true }
      );

    // Optional OpenSea extras
    if (col.image) embed.setThumbnail(col.image);
    if (col.externalUrl) embed.setURL(col.externalUrl);

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    return interaction.reply({
      content: `❌ Error fetching supply info: ${err.message}`,
      flags: 1 << 6,
    });
  }
}
