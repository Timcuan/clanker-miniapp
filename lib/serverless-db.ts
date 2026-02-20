// Serverless-compatible database using encrypted cookies
// This replaces SQLite for Vercel deployment

import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32ch';

// Ensure key is 32 bytes
function getKey(): Buffer {
  return crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = getKey();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(text: string): string {
  try {
    const [ivHex, encrypted] = text.split(':');
    if (!ivHex || !encrypted) return '';
    const iv = Buffer.from(ivHex, 'hex');
    const key = getKey();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.error('Decryption failed:', e);
    return '';
  }
}

// Session data structure
export interface SessionData {
  // Common fields
  address: string;
  createdAt: number;
  expiresAt: number;

  // Telegram auth fields
  privateKey?: string;
  telegramUserId?: number;
  firstName?: string;
  authType?: 'telegram';
}

// Encode session to encrypted string
export function encodeSession(data: SessionData): string {
  const json = JSON.stringify(data);
  return encrypt(json);
}

// Decode session from encrypted string
export function decodeSession(encrypted: string): SessionData | null {
  try {
    const json = decrypt(encrypted);
    if (!json || json.trim() === '') return null;

    let data: SessionData;
    try {
      data = JSON.parse(json) as SessionData;
    } catch (e) {
      console.error('JSON parse failed for session:', e);
      return null;
    }

    // Check expiry
    if (data.expiresAt < Date.now()) {
      return null;
    }

    return data;
  } catch (e) {
    console.error('Session decode failed:', e);
    return null;
  }
}

// Create new session data
export function createSessionData(
  privateKey: string,
  address: string,
  telegramUserId?: number
): SessionData {
  const now = Date.now();
  return {
    privateKey,
    address,
    telegramUserId,
    createdAt: now,
    expiresAt: now + (7 * 24 * 60 * 60 * 1000), // 7 days
  };
}

// Generate session cookie name based on Telegram user ID
export function getSessionCookieName(telegramUserId?: number): string {
  if (telegramUserId) {
    return `clanker_session_${telegramUserId}`;
  }
  return 'clanker_session';
}
