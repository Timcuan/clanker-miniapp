// Simple in-memory session store for user login persistence
// Supports both Telegram and Farcaster platforms
// In production, use Redis or database

export type Platform = 'telegram' | 'farcaster';

export interface UserSession {
  platform: Platform;
  
  // Telegram
  telegramUserId?: number;
  telegramUsername?: string;
  
  // Farcaster
  farcasterFid?: number;
  farcasterUsername?: string;
  
  // Common
  walletAddress?: string;
  accessCode?: string;
  createdAt: number;
  lastActiveAt: number;
}

// Store sessions by platform:userId key
const sessions = new Map<string, UserSession>();

// Session expiry: 30 days
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

// Generate session key
function getSessionKey(userId: number, platform: Platform = 'telegram'): string {
  return `${platform}:${userId}`;
}

export function createSession(
  userId: number, 
  data: Partial<UserSession>,
  platform: Platform = 'telegram'
): UserSession {
  const session: UserSession = {
    platform,
    telegramUserId: platform === 'telegram' ? userId : undefined,
    telegramUsername: data.telegramUsername,
    farcasterFid: platform === 'farcaster' ? userId : undefined,
    farcasterUsername: data.farcasterUsername,
    walletAddress: data.walletAddress,
    accessCode: data.accessCode,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };
  
  const key = getSessionKey(userId, platform);
  sessions.set(key, session);
  console.log(`[Session] Created for ${platform}:${userId}`);
  return session;
}

export function getSession(userId: number, platform: Platform = 'telegram'): UserSession | null {
  const key = getSessionKey(userId, platform);
  const session = sessions.get(key);
  
  if (!session) {
    return null;
  }
  
  // Check if expired
  if (Date.now() - session.lastActiveAt > SESSION_EXPIRY_MS) {
    sessions.delete(key);
    console.log(`[Session] Expired for ${platform}:${userId}`);
    return null;
  }
  
  // Update last active
  session.lastActiveAt = Date.now();
  return session;
}

export function updateSession(
  userId: number, 
  data: Partial<UserSession>,
  platform: Platform = 'telegram'
): UserSession | null {
  const key = getSessionKey(userId, platform);
  const session = sessions.get(key);
  
  if (!session) {
    return null;
  }
  
  // Update fields
  if (data.walletAddress !== undefined) session.walletAddress = data.walletAddress;
  if (data.accessCode !== undefined) session.accessCode = data.accessCode;
  if (data.telegramUsername !== undefined) session.telegramUsername = data.telegramUsername;
  if (data.farcasterUsername !== undefined) session.farcasterUsername = data.farcasterUsername;
  session.lastActiveAt = Date.now();
  
  console.log(`[Session] Updated for ${platform}:${userId}`);
  return session;
}

export function deleteSession(userId: number, platform: Platform = 'telegram'): boolean {
  const key = getSessionKey(userId, platform);
  const deleted = sessions.delete(key);
  if (deleted) {
    console.log(`[Session] Deleted for ${platform}:${userId}`);
  }
  return deleted;
}

export function hasValidSession(userId: number, platform: Platform = 'telegram'): boolean {
  return getSession(userId, platform) !== null;
}

// Get session with wallet (user is fully logged in)
export function getLoggedInSession(userId: number, platform: Platform = 'telegram'): UserSession | null {
  const session = getSession(userId, platform);
  if (session && session.walletAddress) {
    return session;
  }
  return null;
}
