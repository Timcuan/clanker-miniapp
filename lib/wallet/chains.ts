import { base, baseSepolia } from 'viem/chains';

export const supportedChains = [base, baseSepolia] as const;

export const defaultChain = base;

export const chainConfig = {
  [base.id]: {
    name: 'Base',
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org',
    blockExplorer: 'https://basescan.org',
    isTestnet: false,
  },
  [baseSepolia.id]: {
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    blockExplorer: 'https://sepolia.basescan.org',
    isTestnet: true,
  },
} as const;

export function getChainConfig(chainId: number) {
  return chainConfig[chainId as keyof typeof chainConfig];
}
