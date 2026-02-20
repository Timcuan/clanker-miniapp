/**
 * Image URL utilities for Pinata IPFS compatibility
 * Supports multiple input formats and converts to ipfs:// format
 */



/**
 * Extract CID from various Pinata/IPFS URL formats
 * 
 * Supported formats:
 * - Raw CID v1: "bafybeig..." (dag-pb) or "bafkreia..." (raw)
 * - Raw CID v0: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"
 * - ipfs:// URL: "ipfs://bafybeig..."
 * - Pinata gateway: "https://gateway.pinata.cloud/ipfs/bafybeig..."
 * - Other gateways: "https://ipfs.io/ipfs/bafybeig..."
 * - Pinata dedicated: "https://xxx.mypinata.cloud/ipfs/bafybeig..."
 */
export function extractCid(input: string): string | null {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();

  // CID v0 (Qm... 46 chars)
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(trimmed)) {
    return trimmed;
  }

  // CID v1 - all variants starting with baf (bafybei, bafkrei, etc)
  // Minimum 32 chars, base32 lowercase
  if (/^baf[a-z2-7]+$/i.test(trimmed) && trimmed.length >= 32) {
    return trimmed;
  }

  // ipfs:// protocol
  if (trimmed.startsWith('ipfs://')) {
    const cid = trimmed.replace('ipfs://', '').split('/')[0];
    return cid || null;
  }

  // HTTP(S) gateway URLs
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);

      // Check for /ipfs/CID pattern
      const ipfsMatch = url.pathname.match(/\/ipfs\/([a-zA-Z0-9]+)/);
      if (ipfsMatch) {
        return ipfsMatch[1];
      }

      // Check for subdomain pattern: CID.ipfs.gateway.com
      const subdomainMatch = url.hostname.match(/^([a-zA-Z0-9]+)\.ipfs\./);
      if (subdomainMatch) {
        return subdomainMatch[1];
      }
    } catch {
      // Invalid URL
    }
  }

  return null;
}

/**
 * Convert any image input to ipfs:// URL format
 * Returns null if input is invalid or not an IPFS resource
 */
export function toIpfsUrl(input: string): string | null {
  if (!input) return null;

  const trimmed = input.trim();

  // Already ipfs:// format
  if (trimmed.startsWith('ipfs://')) {
    return trimmed;
  }

  // Regular HTTP URL (not IPFS) - return as is
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const cid = extractCid(trimmed);
    if (cid) {
      return `ipfs://${cid}`;
    }
    // Not an IPFS URL, return original
    return trimmed;
  }

  // Raw CID
  const cid = extractCid(trimmed);
  if (cid) {
    return `ipfs://${cid}`;
  }

  return null;
}

/**
 * Convert to gateway URL for display/preview
 */
export function toGatewayUrl(input: string, gateway: string = 'https://gateway.pinata.cloud'): string | null {
  const cid = extractCid(input);
  if (!cid) {
    // If it's a regular HTTP URL, return as is
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return input;
    }
    return null;
  }
  return `${gateway}/ipfs/${cid}`;
}

/**
 * Validate if input is a valid image URL or CID
 */
export function isValidImageInput(input: string): boolean {
  if (!input) return true; // Empty is valid (optional)

  const trimmed = input.trim();

  // Valid CID
  if (extractCid(trimmed)) return true;

  // Valid HTTP URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  // ipfs:// URL
  if (trimmed.startsWith('ipfs://')) return true;

  return false;
}

/**
 * Format image URL for SDK (prefers ipfs://)
 * This is the main function to use when sending to Clanker SDK
 */
export function formatImageForSdk(input: string): string | undefined {
  if (!input) return undefined;

  const ipfsUrl = toIpfsUrl(input.trim());
  return ipfsUrl || undefined;
}
