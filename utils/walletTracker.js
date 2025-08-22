// utils/walletTracker.js
import { alchemyGetNFTsForOwner, alchemyGetAssetTransfers } from './api.js';
import { getAllWallets } from '../db.js';
import { logInfo, logError } from './logger.js';
import { EmbedBuilder } from 'discord.js';

const POLL_INTERVAL_MS = Number(process.env.WALLET_POLL_MS || 60_000);
const ALERT_CHANNEL_ID = process.env.WALLET_ALERT_CHANNEL_ID || process.env.ALERT_CHANNEL_ID;

// Chains we’ll attempt by default if a wallet doesn’t specify
const SUPPORTED_CHAINS = ['ethereum', 'polygon', 'arbitrum', 'optimism'];

// Cache: wallet+chain -> { ids:Set<string>, primed:boolean }
const walletState = new Map();

// Recent alerts (dedupe within TTL)
const recentAlerts = new Map();
const ALERT_TTL_MS = 10 * 60 * 1000; // 10 min

function shouldAlert(key) {
  const now = Date.now();
  if (recentAlerts.has(key) && now - recentAlerts.get(key) < ALERT_TTL_MS) {
    return false;
  }
  recentAlerts.set(key, now);
  return true;
}

// Explorer base URLs by chain
const EXPLORERS = {
  ethereum: 'https://etherscan.io',
  polygon: 'https://polygonscan.com',
  arbitrum: 'https://arbiscan.io',
  optimism: 'https://optimistic.etherscan.io',
};

/**
 * Start periodic wallet tracking
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

        await Promise.all(chains.map(chain =>
          checkWalletOnChain(client, wallet, chain)
        ));
      }
    } catch (err) {
      logError(`Wallet tracker polling error: ${err.message}`);
    }
  }

  poll(); // first run
  setInterval(poll, POLL_INTERVAL_MS);
}

async function checkWalletOnChain(client, wallet, chain) {
  const walletAddress = wallet.address;
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

  // Build normalized ID set
  const currentIds = new Set();
  for (const nft of owned) {
    const contract = (nft?.contract?.address || nft?.contractAddress || '').toLowerCase();
    const rawId = nft?.tokenId ?? nft?.id?.tokenId ?? nft?.token_id ?? '0';
    let tokenId;
    try {
      tokenId = BigInt(rawId).toString();
    } catch {
      tokenId = String(rawId);
    }
    if (contract && tokenId) {
      currentIds.add(`${contract}-${tokenId}`);
    }
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
      if (!shouldAlert(id)) continue; // skip if recently alerted

      const [contract, tokenId] = id.split('-');
      const nft = owned.find(n =>
        (n?.contract?.address?.toLowerCase() === contract || n?.contractAddress?.toLowerCase() === contract) &&
        (String(n?.tokenId ?? n?.id?.tokenId ?? n?.token_id) === tokenId)
      );

      // 🔍 Fetch tx hash for this acquisition
      let txHash = null;
      try {
        const transfers = await alchemyGetAssetTransfers(walletAddress, chain, contract, tokenId);
        if (Array.isArray(transfers) && transfers.length) {
          txHash = transfers[0].hash; // most recent transfer hash
        }
      } catch (err) {
        logError(`Error fetching transfer for ${contract} #${tokenId}: ${err.message}`);
      }

      await safeSendWalletEmbed(client, wallet, chain, nft, contract, tokenId, txHash);
    }
  }

  walletState.set(key, { ids: currentIds, primed: true });
}

async function safeSendWalletEmbed(client, wallet, chain, nft, contract, tokenId, txHash) {
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

    const walletName = wallet.name ? `**${wallet.name}**` :
      `\`${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}\``;

    const name = nft?.title || nft?.metadata?.name || `NFT #${tokenId}`;
    const image =
      nft?.media?.[0]?.gateway ||
      nft?.metadata?.image ||
      nft?.image_url ||
      null;

    const explorerBase = EXPLORERS[chain] || EXPLORERS.ethereum;
    const etherscanLink = `${explorerBase}/token/${contract}?a=${tokenId}`;
    const walletLink = `${explorerBase}/address/${wallet.address}`;

    const embed = new EmbedBuilder()
      .setTitle('🆕 New NFT Detected')
      .setDescription(
        `Wallet ${walletName} ([view](${walletLink})) ` +
        `minted/acquired a new NFT on **${chain}**`
      )
      .addFields(
        { name: 'Contract', value: `[${contract.slice(0, 8)}...](${explorerBase}/token/${contract})`, inline: true },
        { name: 'Token ID', value: `[${tokenId}](${etherscanLink})`, inline: true },
        { name: 'Name', value: name, inline: false },
      )
      .setColor(0x0099ff)
      .setTimestamp();

    if (txHash) {
      embed.addFields({ name: 'Tx', value: `[View Tx](${explorerBase}/tx/${txHash})`, inline: false });
    }
    if (image) embed.setThumbnail(image);

    await channel.send({ embeds: [embed] });
    logInfo(`Sent wallet alert for ${walletName} (${wallet.address}) on ${chain} (${contract} #${tokenId})`);
  } catch (err) {
    logError(`Failed to send wallet alert: ${err.message}`);
  }
}

// Alias export
export { startWalletTracker as trackWalletActivity };
