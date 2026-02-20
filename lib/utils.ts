import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatEther(wei: bigint, decimals = 4): string {
  const eth = Number(wei) / 1e18;
  return eth.toFixed(decimals);
}

export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function normalizeIpfsUri(uri: string): string {
  if (!uri) return '';

  // Already a full IPFS URI
  if (uri.startsWith('ipfs://')) return uri;

  // Just a CID
  if (uri.startsWith('Qm') || uri.startsWith('bafy')) {
    return `ipfs://${uri}`;
  }

  // HTTP gateway URL - convert to ipfs://
  if (uri.includes('ipfs.io/ipfs/')) {
    const cid = uri.split('ipfs.io/ipfs/')[1];
    return `ipfs://${cid}`;
  }

  return uri;
}

export function ipfsToHttp(uri: string): string {
  if (!uri) return '';
  if (uri.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  }
  return uri;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateMessageId(): string {
  return `miniapp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`;
  }
  return num.toString();
}

export function copyToClipboard(text: string): Promise<boolean> {
  if (!navigator?.clipboard) {
    // Fallback?
    return Promise.resolve(false);
  }
  return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
}
