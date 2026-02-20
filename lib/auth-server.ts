
import { cookies } from 'next/headers';
import { decodeSession, getSessionCookieName, SessionData } from '@/lib/serverless-db';
import { findUserByTelegramId } from '@/lib/db/turso';
import { isAdminUser, verifyAccess } from '@/lib/access-control';

export interface AuthStatus {
    userId: number | null;
    isAdmin: boolean;
    hasAccess: boolean;
    isConnected: boolean;
    address: string | null;
    sessionData: SessionData | null;
    error?: string;
}

/**
 * Resolves the authentication status for a Telegram user.
 * Checks both the session cookie and the database fallback.
 */
export async function getAuthStatus(telegramUserId: number): Promise<AuthStatus> {
    const isAdmin = isAdminUser(telegramUserId);
    const { hasAccess, error: accessError } = await verifyAccess(telegramUserId);

    const cookieName = getSessionCookieName(telegramUserId);
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(cookieName)?.value;

    let decodedSession: SessionData | null = sessionCookie ? decodeSession(sessionCookie) : null;
    let restored = false;

    // Recovery logic: fallback to DB if cookie is missing
    if (!decodedSession) {
        try {
            const user = await findUserByTelegramId(telegramUserId);
            if (user && user.encrypted_session) {
                decodedSession = decodeSession(user.encrypted_session);
                if (decodedSession) {
                    restored = true;
                }
            }
        } catch (e) {
            console.error('[Auth] DB Recovery Error:', e);
        }
    }

    return {
        userId: telegramUserId,
        isAdmin,
        hasAccess,
        isConnected: !!decodedSession?.privateKey,
        address: decodedSession?.address || null,
        sessionData: decodedSession,
        error: accessError
    };
}
