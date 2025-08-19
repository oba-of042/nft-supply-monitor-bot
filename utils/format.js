// utils/format.js
import { EmbedBuilder } from 'discord.js';

/**
 * Format NFT supply status into a Discord embed
 * @param {Object} data
 * @param {string} data.name - Collection name
 * @param {string} data.contract - Contract address
 * @param {number} data.totalSupply - Total collection supply
 * @param {number} data.remainingSupply - Remaining supply
 * @param {number|null} data.floorPrice - Floor price (ETH)
 * @param {string|null} data.image - Image URL
 * @param {string|null} data.marketplace - Marketplace URL
 */
export function formatSupplyStatus({
  name,
  contract,
  totalSupply,
  remainingSupply,
  floorPrice,
  image,
  marketplace
}) {
  const embed = new EmbedBuilder()
    .setTitle(`${name} — Supply Update`)
    .setDescription(`**Contract:** \`${contract}\``)
    .setColor(remainingSupply <= 10 ? 0xFF0000 : 0x0099FF)
    .addFields(
      { name: 'Total Supply', value: totalSupply?.toLocaleString() || 'Unknown', inline: true },
      { name: 'Remaining', value: remainingSupply?.toLocaleString() || 'Unknown', inline: true },
      { name: 'Floor Price', value: floorPrice !== null ? `${floorPrice} ETH` : 'Unknown', inline: true }
    )
    .setTimestamp();

  if (image) embed.setThumbnail(image);
  if (marketplace) embed.setURL(marketplace);

  return { embeds: [embed] };
}
