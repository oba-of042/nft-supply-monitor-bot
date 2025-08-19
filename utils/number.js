// utils/number.js
export function formatNumber(num) {
  if (num === undefined || num === null) return 'N/A';
  return num.toLocaleString();
}
