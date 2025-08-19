// utils/walletTracker.js
import { alchemyGetNFTsForOwner } from './api.js';
import { getAllWallets } from '../db.js';
import { logInfo, logError } from './logger.js';
import { EmbedBuilder } from 'discord.js';

const POLL_INTERVAL_MS = Number(process.env.WALLET_POLL_MS || 60_000);
const ALERT_CHANNEL_ID = process.env.WALLET_ALERT_CHANNEL_ID || process.env.ALERT_CHANNEL_ID;

// Chains we’ll attempt by default if a wallet doesn’t specify
const SUPPORTED_CHAINS = ['ethereum', 'polygon', 'arbitrum', 'optimism'];

// Cache: wallet+chain -> { ids:Set<string>, primed:boolean }
const walletState = new Map();

/**
 * Start periodic wallet tracking. Resilient to API failures:
 * - Each chain call is isolated; one failure doesn’t block others.
 * - First scan “primes” cache to avoid backfilling a flood of embeds.
 */
export function startWalletTracker(client) {
  logInfo('Starting wallet tracker...');

  async function poll() {
    try {
      const wallets = getAllWallets();
      if (!wallets.length) return;

      // Batch by wallet, then per chain
      for (const wallet of wallets) {
        const address = (wallet.address || '').trim().toLowerCase();
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) continue;

        const chains = Array.isArray(wallet.chains) && wallet.chains.length
          ? wallet.chains.filter(c => SUPPORTED_CHAINS.includes(c))
          : ['ethereum'];

        await Promise.all(chains.map(chain => checkWalletOnChain(client, address, chain)));
      }
    } catch (err) {
      logError(`Wallet tracker polling error: ${err.message}`);
    }
  }

  // Kick off immediately, then on interval
  poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

async function checkWalletOnChain(client, walletAddress, chain) {
  // Separate state per wallet+chain
  const key = `${walletAddress}:${chain}`;
  const state = walletState.get(key) || { ids: new Set(), primed: false };

  let data;
  try {
    data = await alchemyGetNFTsForOwner(walletAddress, chain);
  } catch (err) {
    logError(`Error fetching NFTs for ${walletAddress} on ${chain}: ${err.message}`);
    return;
  }

  const owned = Array.isArray(data?.ownedNfts) ? data.ownedNfts : [];

  // Build the current ID set
  const currentIds = new Set();
  for (const nft of owned) {
    const contract = nft?.contract?.address || nft?.contractAddress || nft?.contract?.toLowerCase?.() || 'unknown';
    const tokenId = nft?.tokenId ?? nft?.id?.tokenId ?? nft?.token_id ?? 'unknown';
    currentIds.add(`${contract}-${tokenId}`);
  }

  // First run: prime the cache and do NOT alert on historical holdings
  if (!state.primed) {
    walletState.set(key, { ids: currentIds, primed: true });
    logInfo(`Primed wallet ${walletAddress} on ${chain} with ${currentIds.size} NFTs`);
    return;
  }

  // Find newly seen NFTs and alert
  const newOnes = [];
  for (const id of currentIds) {
    if (!state.ids.has(id)) newOnes.push(id);
  }

  if (newOnes.length) {
    for (const id of newOnes) {
      const [contract, tokenId] = id.split('-');
      const nft = owned.find(n =>
        (n?.contract?.address === contract || n?.contractAddress === contract) &&
        (String(n?.tokenId ?? n?.id?.tokenId ?? n?.token_id) === tokenId)
      );

      await safeSendWalletEmbed(client, walletAddress, chain, nft, contract, tokenId);
    }
  }

  // Update cache with the latest snapshot
  walletState.set(key, { ids: currentIds, primed: true });
}

async function safeSendWalletEmbed(client, walletAddress, chain, nft, contract, tokenId) {
  if (!ALERT_CHANNEL_ID) {
    logError('WALLET_ALERT_CHANNEL_ID (or ALERT_CHANNEL_ID) not set in env; cannot send alerts');
    return;
  }

  try {
    const channel = await client.channels.fetch(ALERT_CHANNEL_ID);
    if (!channel) {
      logError(`Discord alert channel ${ALERT_CHANNEL_ID} not found`);
      return;
    }

    // Compose embed
    const name = nft?.title || nft?.metadata?.name || 'NFT';
    const image =
      nft?.media?.[0]?.gateway ||
      nft?.metadata?.image ||
      nft?.image_url ||
      null;

    const embed = new EmbedBuilder()
      .setTitle('🆕 NFT Detected')
      .setDescription(`Wallet **${walletAddress}** now holds a new NFT on **${chain}**`)
      .addFields(
        { name: 'Contract', value: `\`${contract}\``, inline: true },
        { name: 'Token ID', value: `${tokenId}`, inline: true },
      )
      .setColor(0x0099ff)
      .setTimestamp();

    if (name) embed.addFields({ name: 'Name', value: name, inline: false });
    if (image) embed.setThumbnail(image);

    await channel.send({ embeds: [embed] }); // public message
    logInfo(`Sent wallet alert for ${walletAddress} on ${chain} (${contract} #${tokenId})`);
  } catch (err) {
    // Swallow and log so one bad send doesn’t break the loop
    logError(`Failed to send wallet alert: ${err.message}`);
  }
}

// Alias export to match older imports if any
export { startWalletTracker as trackWalletActivity };
