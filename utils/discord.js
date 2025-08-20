// utils/discord.js
import { logError } from './logger.js';

/**
 * Send a message or embed to a specific Discord channel
 * @param {object} client - Discord.js client instance
 * @param {string} channelId - Target channel ID
 * @param {string|object} message - Either plain text or { embeds: [...] }
 */
export async function sendToDiscord(client, channelId, message) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) throw new Error(`Channel ${channelId} not found`);

    if (typeof message === 'string') {
      await channel.send({ content: message });
    } else if (message?.embeds) {
      await channel.send({ embeds: message.embeds });
    } else {
      throw new Error('Invalid Discord message format');
    }
  } catch (err) {
    logError(`Discord send error: ${err.message}`);
  }
}
