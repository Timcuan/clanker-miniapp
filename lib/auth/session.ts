import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { decodeSession, getSessionCookieName, SessionData } from '@/lib/serverless-db';

/**
 * Extracts the Telegram User ID from a request using multiple fallbacks.
 * 1. Headers (x-telegram-user-id)
 * 2. Query Parameters (telegramUserId)
 * 3. Cookies (clanker_session_*)
 * @param request The NextRequest object.
 * @returns The Telegram User ID or undefined if not found.
 */
export async function getTelegramUserIdFromRequest(request: NextRequest): Promise<number | undefined> {
    // 1. Check header first (explicitly set by client)
    const headerUserId = request.headers.get('x-telegram-user-id');
    if (headerUserId) {
        const parsed = parseInt(headerUserId, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    // 2. Check query param as fallback
    const queryUserId = request.nextUrl.searchParams.get('telegramUserId');
    if (queryUserId) {
        const parsed = parseInt(queryUserId, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    // 3. Fallback to cookies: search for any clanker_session_* cookie
    try {
        const cookieStore = await cookies();
        const allCookies = cookieStore.getAll();
        const sessionCookie = allCookies.find(c => c.name.startsWith('clanker_session_'));

        if (sessionCookie) {
            const decoded = decodeSession(sessionCookie.value);
            if (decoded && decoded.telegramUserId) {
                return decoded.telegramUserId;
            }
        }
    } catch (e) {
        console.warn('[Auth] Cookie lookup failed:', e);
    }

    return undefined;
}

/**
 * Retrieves the session data for a request.
 * @param request The NextRequest object.
 * @param telegramUserId Optional pre-extracted Telegram User ID.
 * @returns The SessionData or null if not valid.
 */
export async function getSessionFromRequest(request: NextRequest, telegramUserId?: number): Promise<SessionData | null> {
    const userId = telegramUserId || await getTelegramUserIdFromRequest(request);
    if (!userId) return null;

    const cookieName = getSessionCookieName(userId);
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(cookieName)?.value;

    if (!sessionCookie) return null;

    return decodeSession(sessionCookie);
}
