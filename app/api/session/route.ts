import { NextRequest, NextResponse } from 'next/server';
import { createSession, getSession, updateSession, deleteSession } from '@/lib/session-store';
import { isAdminUser } from '@/lib/access-control';

// GET - Check session status
export async function GET(request: NextRequest) {
  const telegramUserId = request.headers.get('x-telegram-user-id') || 
                         request.nextUrl.searchParams.get('telegramUserId');
  
  if (!telegramUserId) {
    return NextResponse.json({ 
      hasSession: false, 
      error: 'No Telegram user ID' 
    });
  }
  
  const userId = parseInt(telegramUserId, 10);
  const session = getSession(userId);
  const isAdmin = isAdminUser(userId);
  
  if (!session) {
    return NextResponse.json({ 
      hasSession: false,
      isAdmin,
      telegramUserId: userId
    });
  }
  
  // Check if user has wallet connected (fully logged in)
  const isLoggedIn = !!session.walletAddress;
  
  return NextResponse.json({
    hasSession: true,
    isLoggedIn,
    isAdmin,
    telegramUserId: userId,
    telegramUsername: session.telegramUsername,
    walletAddress: session.walletAddress,
    hasAccess: isAdmin || !!session.accessCode,
  });
}

// POST - Create or update session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { telegramUserId, telegramUsername, walletAddress, accessCode } = body;
    
    if (!telegramUserId) {
      return NextResponse.json({ error: 'Telegram user ID required' }, { status: 400 });
    }
    
    const userId = parseInt(telegramUserId, 10);
    let session = getSession(userId);
    
    if (session) {
      // Update existing session
      session = updateSession(userId, { 
        walletAddress, 
        accessCode,
        telegramUsername 
      });
    } else {
      // Create new session
      session = createSession(userId, {
        telegramUsername,
        walletAddress,
        accessCode,
      });
    }
    
    const isAdmin = isAdminUser(userId);
    
    return NextResponse.json({
      success: true,
      session: {
        telegramUserId: userId,
        telegramUsername: session?.telegramUsername,
        walletAddress: session?.walletAddress,
        isAdmin,
        hasAccess: isAdmin || !!session?.accessCode,
      }
    });
  } catch (error) {
    console.error('[Session] Error:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

// DELETE - Logout / clear session
export async function DELETE(request: NextRequest) {
  const telegramUserId = request.headers.get('x-telegram-user-id') || 
                         request.nextUrl.searchParams.get('telegramUserId');
  
  if (!telegramUserId) {
    return NextResponse.json({ error: 'No Telegram user ID' }, { status: 400 });
  }
  
  const userId = parseInt(telegramUserId, 10);
  deleteSession(userId);
  
  return NextResponse.json({ success: true, message: 'Session cleared' });
}
