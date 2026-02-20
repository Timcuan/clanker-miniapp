import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recoverMessageAddress } from 'viem';
import { sendAdminLog } from '@/lib/access-control';

// Message validation regex
const MESSAGE_REGEX = /^Clanker MiniApp Login\nFID: \d+\nNonce: [a-z0-9]{13}\n\nBy signing, you authorize this app to deploy tokens on your behalf.$/;
const UnifiedAuthSchema = z.object({
  message: z.string(),
  signature: z.string(),
  fid: z.number(),
  username: z.string().optional(),
});

// POST /api/auth/unified - Single endpoint for authentication
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = UnifiedAuthSchema.parse(body);
    
    // Validate message format
    if (!MESSAGE_REGEX.test(data.message)) {
      return NextResponse.json(
        { error: 'Invalid message format' },
        { status: 400 }
      );
    }
    
    // Recover address from signature
    const recoveredAddress = recoverMessageAddress({
      message: data.message,
      signature: data.signature as `0x${string}`,
    });
    
    if (!recoveredAddress) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
    
    // Create or find user
    const user = {
      id: data.fid, // Use FID as user ID
      walletAddress: recoveredAddress,
      farcasterFid: data.fid,
      farcasterUsername: data.username,
    };
    
    // Create session data without private key storage
    // We'll use Farcaster's wallet for signing transactions
    const sessionData = {
      userId: user.id,
      address: recoveredAddress,
      fid: data.fid,
      username: data.username,
      authType: 'farcaster-signature',
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
    };
    
    // Set session cookie
    const response = NextResponse.json({
      success: true,
      address: recoveredAddress,
      fid: data.fid,
      username: data.username,
      authType: 'farcaster-signature',
    });
    
    response.cookies.set('auth-session', JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });
    
    console.log(`[UnifiedAuth] Authenticated FID ${data.fid} with address ${recoveredAddress}`);
    sendAdminLog(`[Auth] Farcaster signature login: FID ${data.fid}`);
    
    return response;
  } catch (error) {
    console.error('[UnifiedAuth] Error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}

// GET /api/auth/unified - Check auth status
export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('auth-session')?.value;
    
    if (!sessionCookie) {
      return NextResponse.json({ authenticated: false });
    }
    
    const sessionData = JSON.parse(sessionCookie);
    
    // Check if session expired
    if (Date.now() > sessionData.expiresAt) {
      return NextResponse.json({ authenticated: false, expired: true });
    }
    
    return NextResponse.json({
      authenticated: true,
      address: sessionData.address,
      fid: sessionData.fid,
      username: sessionData.username,
      authType: sessionData.authType,
    });
  } catch (error) {
    console.error('[UnifiedAuth] Status check error:', error);
    return NextResponse.json({ authenticated: false });
  }
}

// DELETE /api/auth/unified - Logout
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  
  // Clear session cookie
  response.cookies.set('auth-session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });
  
  console.log('[UnifiedAuth] Logged out successfully');
  
  return response;
}
