import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthStatus } from '@/lib/auth-server';
import { updateUser } from '@/lib/db/turso';
import { getSessionCookieName, encodeSession } from '@/lib/serverless-db';

export async function GET(request: NextRequest) {
  try {
    const telegramUserIdHeader = request.headers.get('x-telegram-user-id');
    const telegramUserIdQuery = request.nextUrl.searchParams.get('telegramUserId');
    const telegramUserIdStr = telegramUserIdHeader || telegramUserIdQuery;

    if (!telegramUserIdStr) {
      return NextResponse.json({
        hasSession: false,
        error: 'AUTH_REQUIRED',
        message: 'Telegram authentication required'
      });
    }

    const userId = parseInt(telegramUserIdStr, 10);
    const auth = await getAuthStatus(userId);

    // ACTIVITY TRACKING
    if (auth.hasAccess) {
      updateUser(userId, { last_active_at: new Date().toISOString() }).catch(() => { });
    }

    const response = NextResponse.json({
      hasSession: !!auth.sessionData,
      isLoggedIn: auth.isConnected,
      walletAddress: auth.address,
      isAdmin: auth.isAdmin,
      hasAccess: auth.hasAccess,
      accessError: auth.hasAccess ? null : (auth.error || 'UNAUTHORIZED'),
      telegramUserId: userId,
    });

    // Ensure cookie is synced (Persistence Hardening)
    if (auth.sessionData) {
      const cookieName = getSessionCookieName(userId);
      const cookieStore = await cookies();
      if (!cookieStore.get(cookieName)) {
        const encrypted = encodeSession(auth.sessionData);
        response.cookies.set(cookieName, encrypted, {
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          maxAge: 30 * 24 * 60 * 60, // 30 days
          path: '/',
        });
      }
    }

    return response;
  } catch (error) {
    console.error('[Session] Fatal Check Error:', error);
    return NextResponse.json({
      hasSession: false,
      error: 'SERVER_ERROR',
      message: 'Persistent session check failed'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { telegramUserId, telegramUsername } = body;

    if (!telegramUserId) {
      return NextResponse.json({ error: 'ID_REQUIRED' }, { status: 400 });
    }

    const userId = parseInt(telegramUserId, 10);
    await updateUser(userId, {
      username: telegramUsername || undefined,
      last_active_at: new Date().toISOString()
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'UPDATE_FAILED' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const telegramUserIdStr = request.headers.get('x-telegram-user-id') ||
      request.nextUrl.searchParams.get('telegramUserId');

    if (!telegramUserIdStr) return NextResponse.json({ success: true });

    const userId = parseInt(telegramUserIdStr, 10);
    const cookieName = getSessionCookieName(userId);

    // Clear from DB and Browser
    await updateUser(userId, { encrypted_session: null, wallet_address: null });

    const response = NextResponse.json({ success: true });
    response.cookies.delete(cookieName);

    return response;
  } catch (error) {
    return NextResponse.json({ error: 'LOGOUT_FAILED' }, { status: 500 });
  }
}
