import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  validateAccessCode,
  createAccessGrant,
  verifyAccess,
  getAccessCookieName,
  isAdminUser,
  sendAdminLog,
} from '@/lib/access-control';

// Helper to get Telegram user ID from request
function getTelegramUserId(request: NextRequest): number | undefined {
  const headerUserId = request.headers.get('x-telegram-user-id');
  if (headerUserId) {
    const parsed = parseInt(headerUserId, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  const queryUserId = request.nextUrl.searchParams.get('telegramUserId');
  if (queryUserId) {
    const parsed = parseInt(queryUserId, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return undefined;
}

// GET - Check if user has access
export async function GET(request: NextRequest) {
  try {
    const telegramUserId = getTelegramUserId(request);

    console.log(`[Access GET] Checking access for user: ${telegramUserId}`);

    // Admin users always have access
    if (isAdminUser(telegramUserId)) {
      console.log(`[Access GET] User ${telegramUserId} is admin`);
      return NextResponse.json({
        hasAccess: true,
        isAdmin: true,
        telegramUserId,
      });
    }

    const cookieName = getAccessCookieName(telegramUserId);
    const cookieStore = await cookies();
    const accessCookie = cookieStore.get(cookieName)?.value;

    console.log(`[Access GET] Cookie ${cookieName}: ${accessCookie ? 'found' : 'not found'}`);

    const result = verifyAccess(accessCookie, telegramUserId);

    if (result.hasAccess && result.grant) {
      console.log(`[Access GET] Access granted via cookie`);
      return NextResponse.json({
        hasAccess: true,
        isAdmin: false,
        grantedAt: result.grant.grantedAt,
        expiresAt: result.grant.expiresAt,
      });
    }

    console.log(`[Access GET] Access denied: ${result.error}`);
    return NextResponse.json({
      hasAccess: false,
      error: result.error || 'Access required',
    });
  } catch (error) {
    console.error('Access check error:', error);
    return NextResponse.json({ hasAccess: false, error: 'Failed to verify access' });
  }
}

// POST - Validate access code and grant access
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, telegramUserId: bodyTelegramUserId, telegramUsername } = body;

    const telegramUserId = getTelegramUserId(request) || bodyTelegramUserId;

    // Admin users don't need access code
    if (isAdminUser(telegramUserId)) {
      // Log admin access
      sendAdminLog(
        `🔐 <b>Admin Access</b>\n` +
        `👤 User: ${telegramUsername || 'Unknown'}\n` +
        `🆔 ID: ${telegramUserId}\n` +
        `⏰ Time: ${new Date().toISOString()}`
      );

      return NextResponse.json({
        success: true,
        message: 'Admin access granted',
        isAdmin: true,
      });
    }

    if (!code) {
      return NextResponse.json({ success: false, error: 'Access code is required' }, { status: 400 });
    }

    // Validate the access code
    const validation = validateAccessCode(code.toUpperCase().trim(), telegramUserId);

    if (!validation.valid) {
      // Log failed attempt
      sendAdminLog(
        `⚠️ <b>Failed Access Attempt</b>\n` +
        `👤 User: ${telegramUsername || 'Unknown'}\n` +
        `🆔 ID: ${telegramUserId || 'N/A'}\n` +
        `🔑 Code: ${code.slice(0, 4)}****\n` +
        `❌ Error: ${validation.error}\n` +
        `⏰ Time: ${new Date().toISOString()}`
      );

      return NextResponse.json({
        success: false,
        error: validation.error || 'Invalid access code'
      }, { status: 401 });
    }

    // Create access grant
    const grantCookie = createAccessGrant(code.toUpperCase().trim(), telegramUserId);
    const cookieName = getAccessCookieName(telegramUserId);

    // Log successful access
    sendAdminLog(
      `✅ <b>Access Granted</b>\n` +
      `👤 User: ${telegramUsername || 'Unknown'}\n` +
      `🆔 ID: ${telegramUserId || 'N/A'}\n` +
      `🏷️ Label: ${validation.accessCode?.label}\n` +
      `⏰ Time: ${new Date().toISOString()}`
    );

    const response = NextResponse.json({
      success: true,
      message: 'Access granted',
      label: validation.accessCode?.label,
    });

    response.cookies.set(cookieName, grantCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Access grant error:', error);
    return NextResponse.json({ success: false, error: 'Failed to grant access' }, { status: 500 });
  }
}

// DELETE - Revoke access
export async function DELETE(request: NextRequest) {
  try {
    const telegramUserId = getTelegramUserId(request);
    const cookieName = getAccessCookieName(telegramUserId);

    const response = NextResponse.json({ success: true });
    response.cookies.delete(cookieName);

    return response;
  } catch (error) {
    console.error('Access revoke error:', error);
    return NextResponse.json({ success: false, error: 'Failed to revoke access' }, { status: 500 });
  }
}
