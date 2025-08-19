// utils/chains.js
export const chains = {
  ethereum: { chainId: 1, rpc: 'https://eth.llamarpc.com', alchemyNet: 'eth-mainnet', ws: (k)=>`wss://eth-mainnet.g.alchemy.com/v2/${k}` },
  polygon:  { chainId: 137, rpc: 'https://polygon-rpc.com', alchemyNet: 'polygon-mainnet', ws: (k)=>`wss://polygon.g.alchemy.com/v2/${k}` },
  arbitrum: { chainId: 42161, rpc: 'https://arb1.arbitrum.io/rpc', alchemyNet: 'arb-mainnet', ws: (k)=>`wss://arb-mainnet.g.alchemy.com/v2/${k}` },
  base:     { chainId: 8453, rpc: 'https://mainnet.base.org', alchemyNet: 'base-mainnet', ws: (k)=>`wss://base.g.alchemy.com/v2/${k}` }
};

export function pickChain(name='ethereum') {
  return chains[name?.toLowerCase()] || chains.ethereum;
}
