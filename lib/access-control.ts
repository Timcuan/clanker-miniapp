// Access Control System for UMKM Terminal
// Manages access codes for authorized users only
// Supports both Telegram and Farcaster platforms

import crypto from 'crypto';

// Environment variables
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'umkm-admin-secret-change-me';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32ch';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

// Admin IDs (comma-separated in env)
const ADMIN_TELEGRAM_IDS: number[] = (process.env.ADMIN_TELEGRAM_IDS || '')
  .split(',')
  .map(id => parseInt(id.trim(), 10))
  .filter(id => !isNaN(id) && id > 0);

// Admin Farcaster FIDs (comma-separated in env)
const ADMIN_FARCASTER_FIDS: number[] = (process.env.ADMIN_FARCASTER_FIDS || '')
  .split(',')
  .map(id => parseInt(id.trim(), 10))
  .filter(id => !isNaN(id) && id > 0);

// Platform type
export type Platform = 'telegram' | 'farcaster';

// User identifier (works for both platforms)
export interface UserIdentifier {
  platform: Platform;
  id: number;  // Telegram user ID or Farcaster FID
  username?: string;
}

// Check if a user is an admin (supports both platforms)
export function isAdminUser(userId?: number, platform: Platform = 'telegram'): boolean {
  if (!userId) return false;
  if (platform === 'farcaster') {
    return ADMIN_FARCASTER_FIDS.includes(userId);
  }
  return ADMIN_TELEGRAM_IDS.includes(userId);
}

// Check admin by identifier
export function isAdminByIdentifier(identifier?: UserIdentifier): boolean {
  if (!identifier) return false;
  return isAdminUser(identifier.id, identifier.platform);
}

// Send log message to admin via Telegram (non-blocking)
export function sendAdminLog(message: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): void {
  if (!TELEGRAM_BOT_TOKEN || ADMIN_TELEGRAM_IDS.length === 0) {
    console.log('[Admin Log]', message.replace(/<[^>]*>/g, '')); // Strip HTML for console
    return;
  }
  
  // Fire and forget - don't await
  (async () => {
    try {
      for (const adminId of ADMIN_TELEGRAM_IDS) {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: adminId,
            text: message,
            parse_mode: parseMode,
          }),
        });
      }
    } catch {
      // Silently fail - don't block the main flow
      console.log('[Admin Log] Failed to send:', message.replace(/<[^>]*>/g, '').slice(0, 100));
    }
  })();
}

// Ensure key is 32 bytes
function getKey(): Buffer {
  return crypto.scryptSync(ENCRYPTION_KEY, 'access-salt', 32);
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = getKey();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  try {
    const [ivHex, encrypted] = text.split(':');
    if (!ivHex || !encrypted) return '';
    const iv = Buffer.from(ivHex, 'hex');
    const key = getKey();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return '';
  }
}

// Access code data structure
export interface AccessCode {
  code: string;
  label: string;
  platform?: Platform;        // telegram or farcaster
  telegramUserId?: number;    // Telegram user ID
  farcasterFid?: number;      // Farcaster FID
  createdAt: number;
  expiresAt: number | null;
  usageCount: number;
  maxUsage: number | null;
  isActive: boolean;
}

// Access grant data (stored in user's cookie)
export interface AccessGrant {
  code: string;
  platform?: Platform;
  telegramUserId?: number;
  farcasterFid?: number;
  grantedAt: number;
  expiresAt: number;
}

// In-memory storage for access codes
// Combines environment variable codes + dynamically granted codes
let accessCodesCache: AccessCode[] = [];
const dynamicCodes: Map<string, AccessCode> = new Map();

// Parse access codes from environment variable
// Format: code1:label1:maxUsage:expiryDays,code2:label2:maxUsage:expiryDays
export function parseAccessCodesFromEnv(): AccessCode[] {
  const envCodes = process.env.ACCESS_CODES || '';
  if (!envCodes) return [];
  
  try {
    return envCodes.split(',').filter(e => e.trim()).map(entry => {
      const [code, label, maxUsage, expiryDays] = entry.split(':');
      const now = Date.now();
      return {
        code: code.trim().toUpperCase(),
        label: label?.trim() || 'Access Code',
        createdAt: now,
        expiresAt: expiryDays ? now + (parseInt(expiryDays) * 24 * 60 * 60 * 1000) : null,
        usageCount: 0,
        maxUsage: maxUsage ? parseInt(maxUsage) : null,
        isActive: true,
      };
    });
  } catch (e) {
    console.error('Failed to parse ACCESS_CODES:', e);
    return [];
  }
}

// Add a dynamically generated access code
// SECURITY: Code is bound to specific user and is ONE-TIME USE
// Supports both Telegram and Farcaster
export function addDynamicAccessCode(
  code: string, 
  label: string, 
  userId?: number,
  platform: Platform = 'telegram'
): AccessCode {
  const accessCode: AccessCode = {
    code: code.toUpperCase(),
    label,
    platform,
    telegramUserId: platform === 'telegram' ? userId : undefined,
    farcasterFid: platform === 'farcaster' ? userId : undefined,
    createdAt: Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours only
    usageCount: 0,
    maxUsage: 1, // ONE-TIME USE - prevents code sharing
    isActive: true,
  };
  dynamicCodes.set(code.toUpperCase(), accessCode);
  accessCodesCache = [];
  return accessCode;
}

// Remove a dynamic access code
export function removeDynamicAccessCode(code: string): boolean {
  const result = dynamicCodes.delete(code.toUpperCase());
  accessCodesCache = [];
  return result;
}

// Get all valid access codes (env + dynamic)
export function getAccessCodes(): AccessCode[] {
  if (accessCodesCache.length === 0) {
    const envCodes = parseAccessCodesFromEnv();
    const dynCodes = Array.from(dynamicCodes.values());
    accessCodesCache = [...envCodes, ...dynCodes];
  }
  return accessCodesCache;
}

// Get dynamic codes only (for listing)
export function getDynamicAccessCodes(): AccessCode[] {
  return Array.from(dynamicCodes.values());
}

// Validate an access code
// SECURITY: Strict validation - code must match user ID
// Supports both Telegram and Farcaster
export function validateAccessCode(
  code: string, 
  userId?: number,
  platform: Platform = 'telegram'
): { 
  valid: boolean; 
  error?: string;
  accessCode?: AccessCode;
} {
  const normalizedCode = code.toUpperCase().trim();
  const codes = getAccessCodes();
  const accessCode = codes.find(c => c.code === normalizedCode);
  
  if (!accessCode) {
    console.log(`[Access] Invalid code: ${normalizedCode}`);
    sendAdminLog(`[SECURITY] Invalid code: ${normalizedCode} by ${platform}:${userId || 'unknown'}`);
    return { valid: false, error: 'Invalid code' };
  }
  
  if (!accessCode.isActive) {
    return { valid: false, error: 'Code disabled' };
  }
  
  if (accessCode.expiresAt && accessCode.expiresAt < Date.now()) {
    return { valid: false, error: 'Code expired' };
  }
  
  if (accessCode.maxUsage && accessCode.usageCount >= accessCode.maxUsage) {
    return { valid: false, error: 'Code already used' };
  }
  
  // SECURITY: Check platform-specific binding
  const boundUserId = platform === 'farcaster' ? accessCode.farcasterFid : accessCode.telegramUserId;
  
  if (boundUserId) {
    if (!userId) {
      console.log(`[Access] Code ${normalizedCode} requires ${platform} ID`);
      sendAdminLog(`[SECURITY] Code ${normalizedCode} used without ${platform} ID`);
      return { valid: false, error: 'Invalid access' };
    }
    if (boundUserId !== userId) {
      console.log(`[Access] Code ${normalizedCode} belongs to ${boundUserId}, not ${userId}`);
      sendAdminLog(`[SECURITY] ${platform}:${userId} tried to use code for ${boundUserId}`);
      return { valid: false, error: 'Invalid code' };
    }
  }
  
  // Mark code as used
  accessCode.usageCount++;
  if (accessCode.maxUsage && accessCode.usageCount >= accessCode.maxUsage) {
    accessCode.isActive = false;
  }
  
  console.log(`[Access] Code valid: ${normalizedCode} for ${platform}:${userId}`);
  return { valid: true, accessCode };
}

// Create access grant cookie value
// Supports both Telegram and Farcaster
export function createAccessGrant(
  code: string, 
  userId?: number,
  platform: Platform = 'telegram'
): string {
  const grant: AccessGrant = {
    code,
    platform,
    telegramUserId: platform === 'telegram' ? userId : undefined,
    farcasterFid: platform === 'farcaster' ? userId : undefined,
    grantedAt: Date.now(),
    expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
  };
  return encrypt(JSON.stringify(grant));
}

// Decode access grant from cookie
export function decodeAccessGrant(encrypted: string): AccessGrant | null {
  try {
    const json = decrypt(encrypted);
    if (!json) return null;
    const grant = JSON.parse(json) as AccessGrant;
    
    // Check if grant is expired
    if (grant.expiresAt < Date.now()) {
      return null;
    }
    
    return grant;
  } catch {
    return null;
  }
}

// Verify if user has valid access
// SECURITY: Strict verification - grant must match user
// Supports both Telegram and Farcaster
export function verifyAccess(
  grantCookie: string | undefined, 
  userId?: number,
  platform: Platform = 'telegram'
): {
  hasAccess: boolean;
  grant?: AccessGrant;
  error?: string;
} {
  if (!grantCookie) {
    return { hasAccess: false, error: 'No access' };
  }
  
  const grant = decodeAccessGrant(grantCookie);
  if (!grant) {
    return { hasAccess: false, error: 'Invalid access' };
  }
  
  if (grant.expiresAt < Date.now()) {
    return { hasAccess: false, error: 'Access expired' };
  }
  
  // SECURITY: Grant MUST match user ID for the platform
  const grantUserId = platform === 'farcaster' ? grant.farcasterFid : grant.telegramUserId;
  
  if (grantUserId && userId) {
    if (grantUserId !== userId) {
      console.log(`[Access] Grant mismatch: cookie for ${grantUserId}, request from ${platform}:${userId}`);
      sendAdminLog(`[SECURITY] Access mismatch: ${platform}:${userId} using grant for ${grantUserId}`);
      return { hasAccess: false, error: 'Invalid access' };
    }
  }
  
  return { hasAccess: true, grant };
}

// Admin authentication
export function verifyAdminSecret(secret: string): boolean {
  return secret === ADMIN_SECRET;
}

// Generate a random access code
export function generateAccessCode(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like 0, O, 1, I
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Get access grant cookie name (per Telegram user)
export function getAccessCookieName(telegramUserId?: number): string {
  if (telegramUserId) {
    return `umkm_access_${telegramUserId}`;
  }
  return 'umkm_access';
}
