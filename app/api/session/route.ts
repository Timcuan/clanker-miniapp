import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminUser, verifyAccess } from '@/lib/access-control';
import { findUserByTelegramId, updateUser } from '@/lib/db/turso';
import { decodeSession, getSessionCookieName } from '@/lib/serverless-db';

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
    const isAdmin = isAdminUser(userId);
    const { hasAccess, error: accessError } = await verifyAccess(userId);

    const cookieName = getSessionCookieName(userId);
    const cookieStore = await cookies();
    let sessionCookie = cookieStore.get(cookieName)?.value;

    // RECOVERY LOGIC: Restore from DB if cookie is missing OR corrupted
    let restoredFromDb = false;
    let decodedSession = sessionCookie ? decodeSession(sessionCookie) : null;

    if (!decodedSession) {
      const user = await findUserByTelegramId(userId);
      if (user && user.encrypted_session) {
        decodedSession = decodeSession(user.encrypted_session);
        if (decodedSession) {
          sessionCookie = user.encrypted_session;
          restoredFromDb = true;
          console.log(`[Session] Restored via DB for ${userId}`);
        }
      }
    }

    // ACTIVITY TRACKING
    if (hasAccess) {
      // Background update last active
      updateUser(userId, { last_active_at: new Date().toISOString() }).catch(() => { });
    }

    const response = NextResponse.json({
      hasSession: !!decodedSession,
      isLoggedIn: !!decodedSession?.privateKey,
      walletAddress: decodedSession?.address || null,
      isAdmin,
      hasAccess,
      accessError: hasAccess ? null : (accessError || 'UNAUTHORIZED'),
      telegramUserId: userId,
    });

    // Sync cookie back if it was missing or we restored it
    if (sessionCookie && (restoredFromDb || !cookieStore.get(cookieName))) {
      response.cookies.set(cookieName, sessionCookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
      });
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
