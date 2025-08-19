import fetch from 'node-fetch';
import { logError } from './logger.js';

/**
 * Send a Discord embed or plain text message
 * @param {string} webhookUrl - Discord webhook URL
 * @param {object|string} message - Either a string or { embeds: [EmbedBuilder] }
 */
export async function sendToDiscord(webhookUrl, message) {
  try {
    let payload;
    if (typeof message === 'string') {
      payload = { content: message };
    } else if (message?.embeds) {
      // Convert Discord.js EmbedBuilder to raw JSON
      payload = { embeds: message.embeds.map(embed => embed.toJSON()) };
    } else {
      throw new Error('Invalid Discord message format');
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Discord webhook failed: ${res.status} ${text}`);
    }
  } catch (err) {
    logError(`Discord send error: ${err.message}`);
  }
}
