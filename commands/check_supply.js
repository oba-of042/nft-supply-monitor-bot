// commands/check_supply.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getMonitorByName } from '../db.js';
import { fetchCollectionStats } from '../utils/api.js';

export const data = new SlashCommandBuilder()
  .setName('check_supply')
  .setDescription('Check current supply status of a monitor')
  .addStringOption(option =>
    option.setName('name').setDescription('Monitor name').setRequired(true)
  );

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
    // use the actual fields stored in DB
    const contract = monitor.contract || monitor.contractAddress;
    const chain = monitor.chain || 'ethereum';

    const stats = await fetchCollectionStats(contract, chain);

    if (!stats?.collections?.length) {
      return interaction.reply({
        content: `❌ Failed to fetch collection stats for ${monitor.name} on ${chain}.`,
        flags: 1 << 6,
      });
    }

    const collection = stats.collections[0];
    const totalSupply = collection.tokenCount?.toString() || 'N/A';
    const floorPrice = collection.floorAsk?.price?.amount?.decimal?.toString() || 'N/A';

    const embed = new EmbedBuilder()
      .setTitle(`Supply Info for ${monitor.name}`)
      .addFields(
        { name: 'Contract', value: contract, inline: false },
        { name: 'Chain', value: chain, inline: true },
        { name: 'Total Supply', value: totalSupply, inline: true },
        { name: 'Floor Price', value: floorPrice, inline: true },
      )
      .setColor('#0099ff')
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    return interaction.reply({
      content: `❌ Error fetching supply info: ${err.message}`,
      flags: 1 << 6,
    });
  }
}
