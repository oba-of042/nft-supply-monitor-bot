// utils/discord.js
import { logError, logInfo } from './logger.js';

/**
 * Send a message or embed to a specific Discord channel
 * @param {object} client - Discord.js client instance
 * @param {string} channelId - Target channel ID
 * @param {string|object} message - Either plain text or { embeds: [...] }
 */
export async function sendToDiscord(client, channelId, message) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      logError(`[sendToDiscord] Channel ${channelId} not found`);
      return false;
    }

    if (typeof message === 'string') {
      await channel.send({ content: message });
    } else if (message?.embeds) {
      await channel.send({ embeds: message.embeds });
    } else {
      throw new Error('Invalid Discord message format');
    }

    logInfo(`[sendToDiscord] Message successfully sent to channel ${channelId}`);
    return true;
  } catch (err) {
    logError(`[sendToDiscord] Failed to send to ${channelId}: ${err.message}`);
    if (err?.stack) logError(err.stack);
    if (err?.code) logError(`[sendToDiscord] Discord error code: ${err.code}`);
    if (err?.rawError) logError(`[sendToDiscord] Raw error: ${JSON.stringify(err.rawError)}`);
    return false;
  }
}
