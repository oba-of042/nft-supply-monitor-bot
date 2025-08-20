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

// Explorer base URLs by chain
const EXPLORERS = {
  ethereum: 'https://etherscan.io',
  polygon: 'https://polygonscan.com',
  arbitrum: 'https://arbiscan.io',
  optimism: 'https://optimistic.etherscan.io',
};

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
    const contract = nft?.contract?.address || nft?.contractAddress || 'unknown';
    const tokenId = nft?.tokenId ?? nft?.id?.tokenId ?? nft?.token_id ?? 'unknown';
    currentIds.add(`${contract.toLowerCase()}-${tokenId}`);
  }

  if (!state.primed) {
    walletState.set(key, { ids: currentIds, primed: true });
    logInfo(`Primed wallet ${walletAddress} on ${chain} with ${currentIds.size} NFTs`);
    return;
  }

  // Detect new NFTs
  const newOnes = [];
  for (const id of currentIds) {
    if (!state.ids.has(id)) newOnes.push(id);
  }

  if (newOnes.length) {
    for (const id of newOnes) {
      const [contract, tokenId] = id.split('-');
      const nft = owned.find(n =>
        (n?.contract?.address?.toLowerCase() === contract || n?.contractAddress?.toLowerCase() === contract) &&
        (String(n?.tokenId ?? n?.id?.tokenId ?? n?.token_id) === tokenId)
      );

      await safeSendWalletEmbed(client, walletAddress, chain, nft, contract, tokenId);
    }
  }

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

    const name = nft?.title || nft?.metadata?.name || `NFT #${tokenId}`;
    const image =
      nft?.media?.[0]?.gateway ||
      nft?.metadata?.image ||
      nft?.image_url ||
      null;

    const explorerBase = EXPLORERS[chain] || EXPLORERS.ethereum;
    const etherscanLink = `${explorerBase}/token/${contract}?a=${tokenId}`;
    const walletLink = `${explorerBase}/address/${walletAddress}`;

    const embed = new EmbedBuilder()
      .setTitle('🆕 New NFT Detected')
      .setDescription(
        `Wallet [\`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\`](${walletLink}) ` +
        `minted/acquired a new NFT on **${chain}**`
      )
      .addFields(
        { name: 'Contract', value: `[${contract.slice(0, 8)}...](${explorerBase}/token/${contract})`, inline: true },
        { name: 'Token ID', value: `[${tokenId}](${etherscanLink})`, inline: true },
        { name: 'Name', value: name, inline: false },
      )
      .setColor(0x0099ff)
      .setTimestamp();

    if (image) embed.setThumbnail(image);

    await channel.send({ embeds: [embed] });
    logInfo(`Sent wallet alert for ${walletAddress} on ${chain} (${contract} #${tokenId})`);
  } catch (err) {
    logError(`Failed to send wallet alert: ${err.message}`);
  }
}

// Alias export
export { startWalletTracker as trackWalletActivity };
