import { createWalletClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

export interface PrivateKeyWalletConfig {
  privateKey: `0x${string}`;
  rpcUrl?: string;
}

export function createPrivateKeyWallet(config: PrivateKeyWalletConfig) {
  const account = privateKeyToAccount(config.privateKey);
  
  const client = createWalletClient({
    account,
    chain: base,
    transport: http(config.rpcUrl || process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
  }).extend(publicActions);

  return {
    account,
    client,
    address: account.address,
  };
}

export function validatePrivateKey(key: string): boolean {
  // Check if it's a valid hex string with 0x prefix and 64 hex characters
  const regex = /^0x[a-fA-F0-9]{64}$/;
  return regex.test(key);
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
