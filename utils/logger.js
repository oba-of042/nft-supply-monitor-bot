// utils/logger.js
const prefix = process.env.LOG_PREFIX || '[NFT-MONITOR]';
export function logInfo(...args) { console.log(prefix, '[INFO]', new Date().toISOString(), ...args); }
export function logError(...args) { console.error(prefix, '[ERROR]', new Date().toISOString(), ...args); }

