import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramWebAppData, parseTelegramWebAppData } from '@/lib/telegram/auth';
import { getAuthStatus } from '@/lib/auth-server';
import { encodeSession, getSessionCookieName, createSessionData } from '@/lib/serverless-db';
import { cookies } from 'next/headers';
import { updateUser, findUserByTelegramId, createUser } from '@/lib/db/turso';

// Helper to safely parse JSON body
async function getSafeBody(request: NextRequest) {
    try {
        const text = await request.text();
        if (!text || text.trim() === '') return {};
        return JSON.parse(text);
    } catch (e) {
        console.error('[API] Body parse failed:', e);
        return {};
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await getSafeBody(request);
        const { initData } = body;

        if (!initData) {
            return NextResponse.json({ error: 'No initData provided' }, { status: 400 });
        }

        // 1. Validate Telegram Data
        const isValid = validateTelegramWebAppData(initData, process.env.TELEGRAM_BOT_TOKEN);
        if (!isValid) {
            console.error('[Auth Login] Invalid InitData. Token exists:', !!process.env.TELEGRAM_BOT_TOKEN);
            return NextResponse.json({ error: 'Invalid authentication data' }, { status: 401 });
        }

        // 2. Parse User Data
        const telegramUser = parseTelegramWebAppData(initData);
        if (!telegramUser || !telegramUser.id) {
            return NextResponse.json({ error: 'Invalid user data' }, { status: 400 });
        }

        const userId = telegramUser.id;

        // 3. User Persistence / Registration (Sync with DB)
        let user = await findUserByTelegramId(userId);
        if (!user) {
            console.log('[Auth Login] New user detected, creating:', userId);
            await createUser(userId, telegramUser.username, telegramUser.first_name);
            user = await findUserByTelegramId(userId);
        } else {
            console.log('[Auth Login] Existing user logged in:', userId);
            await updateUser(userId, {
                username: telegramUser.username || undefined,
                first_name: telegramUser.first_name || undefined,
                last_active_at: new Date().toISOString()
            });
        }

        // 4. Check if user has an existing wallet session
        if (user?.encrypted_session && user?.wallet_address) {
            // Restore Session
            const sessionCookieName = getSessionCookieName(userId);
            const response = NextResponse.json({
                success: true,
                restored: true,
                address: user.wallet_address,
                telegramUserId: userId
            });

            response.cookies.set(sessionCookieName, user.encrypted_session, {
                httpOnly: true,
                secure: true,
                sameSite: 'none',
                maxAge: 30 * 24 * 60 * 60, // 30 days
                path: '/',
            });

            return response;
        }

        // 5. If no wallet, return authenticated but not wallet-connected status
        return NextResponse.json({
            success: true,
            restored: false,
            telegramUserId: userId,
            message: 'User authenticated, no wallet found'
        });

    } catch (error) {
        console.error('[Auth Login] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
