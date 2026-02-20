import { NextRequest, NextResponse } from 'next/server';
import { getAuthStatus } from '@/lib/auth-server';

// Helper to get Telegram user ID
function getTelegramUserId(request: NextRequest): number | undefined {
  const headerUserId = request.headers.get('x-telegram-user-id');
  if (headerUserId) return parseInt(headerUserId, 10);
  const queryUserId = request.nextUrl.searchParams.get('telegramUserId');
  if (queryUserId) return parseInt(queryUserId, 10);
  return undefined;
}

// GET - Check access status
export async function GET(request: NextRequest) {
  try {
    const telegramUserId = getTelegramUserId(request);
    if (!telegramUserId) return NextResponse.json({ hasAccess: false, error: 'ID_REQUIRED' });

    const auth = await getAuthStatus(telegramUserId);
    return NextResponse.json({
      hasAccess: auth.hasAccess,
      isAdmin: auth.isAdmin,
      error: auth.hasAccess ? null : (auth.error || 'UNAUTHORIZED')
    });
  } catch (error) {
    return NextResponse.json({ hasAccess: false, error: 'SERVICE_ERROR' });
  }
}

// POST - Disabled (Hardened Security)
export async function POST() {
  return NextResponse.json({ error: 'Direct access code entry is disabled. Contact Admin.' }, { status: 403 });
}
