import { isUserAuthorized, authorizeUser, unauthorizeUser } from './db/turso';

// Environment variables
export const ADMIN_SECRET = process.env.ADMIN_SECRET || 'umkm-admin-secret-change-me';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

// Primary Admin ID (the user) - can be overridden by env
export const PRIMARY_ADMIN_ID = Number(process.env.PRIMARY_ADMIN_ID) || 1558397457;

// Admin IDs (comma-separated in env)
const ADMIN_TELEGRAM_IDS: number[] = (process.env.ADMIN_TELEGRAM_IDS || '')
  .split(',')
  .map(id => parseInt(id.trim(), 10))
  .filter(id => !isNaN(id) && id > 0);

// Ensure PRIMARY_ADMIN_ID is always in the list
if (PRIMARY_ADMIN_ID && !ADMIN_TELEGRAM_IDS.includes(PRIMARY_ADMIN_ID)) {
  ADMIN_TELEGRAM_IDS.push(PRIMARY_ADMIN_ID);
}

// User identifier
export interface UserIdentifier {
  id: number;  // Telegram user ID
  username?: string;
}

// Check if a user is an admin
export function isAdminUser(userId?: number): boolean {
  if (!userId) return false;
  const numericId = Number(userId);
  if (isNaN(numericId)) return false;

  // Primary admin check (Highest priority)
  if (numericId === PRIMARY_ADMIN_ID) return true;

  // Secondary admins list
  return ADMIN_TELEGRAM_IDS.includes(numericId);
}

// Grant access to a user
export async function grantAccess(userId: number): Promise<void> {
  await authorizeUser(userId);
  console.log(`[Access] Granted to Telegram:${userId}`);
}

// Revoke access from a user
export async function revokeAccess(userId: number): Promise<void> {
  await unauthorizeUser(userId);
  console.log(`[Access] Revoked from Telegram:${userId}`);
}

// Verify if user has valid access
export async function verifyAccess(
  userId?: number
): Promise<{
  hasAccess: boolean;
  error?: string;
}> {
  if (!userId) {
    return { hasAccess: false, error: 'No user ID' };
  }

  // Admin ALWAYS has access regardless of DB state
  if (isAdminUser(userId)) {
    return { hasAccess: true };
  }

  // Check database for authorization
  try {
    const authorized = await isUserAuthorized(userId);
    if (authorized) {
      return { hasAccess: true };
    }
  } catch (dbError) {
    console.error('[Access] DB unreachable:', dbError);
    return { hasAccess: false, error: 'Authorization service currently unavailable' };
  }

  console.log('[Access] Access denied for user:', userId);
  return { hasAccess: false, error: 'Access denied' };
}

// Send log message to admin (non-blocking)
export function sendAdminLog(message: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): void {
  if (!TELEGRAM_BOT_TOKEN) return;
  (async () => {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: PRIMARY_ADMIN_ID,
          text: message,
          parse_mode: parseMode,
        }),
      });
    } catch { }
  })();
}

export function verifyAdminSecret(secret: string): boolean {
  return secret === ADMIN_SECRET;
}
