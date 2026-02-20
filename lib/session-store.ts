// Simple in-memory session store for user login persistence
// Supports Telegram platform
// In production, use Redis or database

export interface UserSession {
  // Telegram
  telegramUserId: number;
  telegramUsername?: string;

  // Common
  walletAddress?: string;
  accessCode?: string;
  createdAt: number;
  lastActiveAt: number;
}

// Store sessions by userId key
const sessions = new Map<number, UserSession>();

// Session expiry: 30 days
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

export function createSession(
  userId: number,
  data: Partial<UserSession>
): UserSession {
  const session: UserSession = {
    telegramUserId: userId,
    telegramUsername: data.telegramUsername,
    walletAddress: data.walletAddress,
    accessCode: data.accessCode,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };

  sessions.set(userId, session);
  console.log(`[Session] Created for Telegram:${userId}`);
  return session;
}

export function getSession(userId: number): UserSession | null {
  const session = sessions.get(userId);

  if (!session) {
    return null;
  }

  // Check if expired
  if (Date.now() - session.lastActiveAt > SESSION_EXPIRY_MS) {
    sessions.delete(userId);
    console.log(`[Session] Expired for Telegram:${userId}`);
    return null;
  }

  // Update last active
  session.lastActiveAt = Date.now();
  return session;
}

export function updateSession(
  userId: number,
  data: Partial<UserSession>
): UserSession | null {
  const session = sessions.get(userId);

  if (!session) {
    return null;
  }

  // Update fields
  if (data.walletAddress !== undefined) session.walletAddress = data.walletAddress;
  if (data.accessCode !== undefined) session.accessCode = data.accessCode;
  if (data.telegramUsername !== undefined) session.telegramUsername = data.telegramUsername;
  session.lastActiveAt = Date.now();

  console.log(`[Session] Updated for Telegram:${userId}`);
  return session;
}

export function deleteSession(userId: number): boolean {
  const deleted = sessions.delete(userId);
  if (deleted) {
    console.log(`[Session] Deleted for Telegram:${userId}`);
  }
  return deleted;
}

export function hasValidSession(userId: number): boolean {
  return getSession(userId) !== null;
}

// Get session with wallet (user is fully logged in)
export function getLoggedInSession(userId: number): UserSession | null {
  const session = getSession(userId);
  if (session && session.walletAddress) {
    return session;
  }
  return null;
}
