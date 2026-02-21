import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

const DEFAULT_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

/**
 * Creates a Viem public client for the Base network.
 * @param customRpcUrl Optional custom RPC URL to override the default.
 * @returns A Viem public client.
 */
export function getPublicClient(customRpcUrl?: string) {
  return createPublicClient({
    chain: base,
    transport: http(customRpcUrl || DEFAULT_RPC_URL),
  });
}

/**
 * Formats an Ethereum address to a short version (e.g., 0x1234...abcd).
 * @param address The full Ethereum address.
 * @returns The formatted address.
 */
export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Fetches the ETH balance for a given address.
 * @param address The Ethereum address to check.
 * @param customRpcUrl Optional custom RPC URL.
 * @returns The balance in Ether as a string.
 */
export async function getEthBalance(address: string, customRpcUrl?: string): Promise<string> {
  const client = getPublicClient(customRpcUrl);
  const balance = await client.getBalance({ address: address as `0x${string}` });
  return formatEther(balance);
}
