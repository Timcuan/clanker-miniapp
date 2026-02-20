import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccess,
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

    if (!telegramUserId) {
      return NextResponse.json({ hasAccess: false, error: 'User ID required' });
    }

    // verifyAccess now checks both Admin status and DB authorization
    const { hasAccess, error } = await verifyAccess(telegramUserId);
    const isAdmin = isAdminUser(telegramUserId);

    if (hasAccess) {
      return NextResponse.json({
        hasAccess: true,
        isAdmin,
        telegramUserId,
      });
    }

    return NextResponse.json({
      hasAccess: false,
      error: error || 'Access denied',
    });
  } catch (error) {
    console.error('[Access] GET error:', error);
    return NextResponse.json({ hasAccess: false, error: 'Validation failed' });
  }
}

// POST - (Legacy/Optional) Currently access is granted by Admin via ID
export async function POST(request: NextRequest) {
  return NextResponse.json({
    success: false,
    error: 'Access is managed by Admin. Please contact an admin for authorization.'
  }, { status: 403 });
}

// Health check
export async function HEAD() {
  return new Response(null, { status: 200 });
}
