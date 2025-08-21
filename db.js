// db.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(__dirname, 'storage', 'db.json');

let data = {};

// Load or initialize JSON database
try {
  if (fs.existsSync(DB_FILE)) {
    data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  }
} catch (err) {
  console.error('Failed to load DB:', err);
}

// ------------------
// Normalizers
// ------------------
function normalizeMonitor(m) {
  return {
    id: m.id || Date.now().toString(),
    name: m.name,
    contractAddress: m.contractAddress || m.contract || '',
    chain: m.chain || 'ethereum',
    threshold: typeof m.threshold === 'number' ? m.threshold : null,
    alerted: typeof m.alerted === 'boolean' ? m.alerted : false,
  };
}

function normalizeWallet(w) {
  return {
    address: (w.address || '').toLowerCase(),
    name: w.name || null, // ✅ store wallet name
    chains: Array.isArray(w.chains) && w.chains.length
      ? w.chains
      : ['ethereum'],
  };
}

// ------------------
// Save helper
// ------------------
function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ------------------
// Monitors
// ------------------
export function getAllMonitors() {
  if (!data.monitors) data.monitors = [];
  return data.monitors.map(normalizeMonitor);
}

export function getMonitorByName(name) {
  return getAllMonitors().find(m => m.name === name) || null;
}

export function addMonitor(monitor) {
  if (!data.monitors) data.monitors = [];
  data.monitors.push(normalizeMonitor(monitor));
  save();
}

export function updateMonitor(id, update) {
  if (!data.monitors) return false;
  const idx = data.monitors.findIndex(m => m.id === id);
  if (idx !== -1) {
    data.monitors[idx] = normalizeMonitor({
      ...data.monitors[idx],
      ...update,
    });
    save();
    return true;
  }
  return false;
}

export function removeMonitor(name) {
  if (!data.monitors) return false;
  const originalLength = data.monitors.length;
  data.monitors = data.monitors.filter(m => m.name !== name);
  if (data.monitors.length !== originalLength) {
    save();
    return true;
  }
  return false;
}

// ------------------
// Wallets
// ------------------
export function getAllWallets() {
  if (!data.wallets) data.wallets = [];
  return data.wallets.map(normalizeWallet);
}

export function addWallet(wallet) {
  if (!data.wallets) data.wallets = [];
  const normalized = normalizeWallet(wallet);

  // ✅ Prevent duplicates by address
  if (data.wallets.find(w => w.address === normalized.address)) {
    return false; // duplicate, skip
  }

  data.wallets.push(normalized);
  save();
  return true;
}

export function removeWallet(identifier) {
  if (!data.wallets) return false;
  const idLower = identifier.toLowerCase();

  const originalLength = data.wallets.length;
  data.wallets = data.wallets.filter(
    w =>
      w.address.toLowerCase() !== idLower &&
      (w.name ? w.name.toLowerCase() !== idLower : true)
  );

  if (data.wallets.length !== originalLength) {
    save();
    return true;
  }
  return false;
}
