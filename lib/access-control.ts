import { isUserAuthorized, authorizeUser, unauthorizeUser } from './db/turso';

// Environment variables
export const ADMIN_SECRET = process.env.ADMIN_SECRET || 'umkm-admin-secret-change-me';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32ch';
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

  // Specific check for primary admin
  if (numericId === PRIMARY_ADMIN_ID) return true;

  const isIncluded = ADMIN_TELEGRAM_IDS.includes(numericId);
  if (!isIncluded) {
    console.log(`[Access] Admin check failed for Telegram:${numericId}. Primary is ${PRIMARY_ADMIN_ID}`);
  }
  return isIncluded;
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
    console.error('[Access] DB unreachable during verification:', dbError);
    // If DB is down, we deny access to non-admins as a safe default
    return { hasAccess: false, error: 'Authorization service currently unavailable' };
  }

  return { hasAccess: false, error: 'Access denied' };
}

// Send log message to admin via Telegram (non-blocking)
export function sendAdminLog(message: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): void {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[Admin Log]', message.replace(/<[^>]*>/g, '')); // Strip HTML for console
    return;
  }

  // Fire and forget - don't await
  (async () => {
    try {
      // Send only to Primary Admin for security/speed
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: PRIMARY_ADMIN_ID,
          text: message,
          parse_mode: parseMode,
        }),
      });
    } catch {
      // Silently fail
      console.log('[Admin Log] Failed to send:', message.replace(/<[^>]*>/g, '').slice(0, 100));
    }
  })();
}

// Helper to get access grant cookie name (legacy support)
export function getAccessCookieName(telegramUserId?: number): string {
  if (telegramUserId) {
    return `umkm_access_${telegramUserId}`;
  }
  return 'umkm_access';
}

// Legacy helpers for backward compatibility if needed, but mostly focused on DB now
export function generateAccessCode(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function verifyAdminSecret(secret: string): boolean {
  return secret === ADMIN_SECRET;
}

export interface AccessCode {
  code: string;
  label: string;
  isActive: boolean;
  usageCount: number;
  maxUsage?: number;
  expiresAt?: Date;
  createdAt: Date;
}

export function getAccessCodes(): AccessCode[] {
  const codesStr = process.env.ACCESS_CODES || '';
  if (!codesStr) return [];

  return codesStr.split(',').filter(Boolean).map(item => {
    const [code, label, maxUsage, expiryDays] = item.split(':');
    return {
      code,
      label: label || 'Default',
      isActive: true,
      usageCount: 0,
      maxUsage: maxUsage ? parseInt(maxUsage, 10) : undefined,
      createdAt: new Date(),
    };
  });
}
