import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();
    
    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }
    
    // Get session from cookies
    const sessionId = request.cookies.get('wallet-session')?.value;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'No active session' },
        { status: 401 }
      );
    }
    
    // TODO: Implement actual signing logic using the session
    // This would involve retrieving the private key from secure storage
    // and signing the message server-side
    
    // For now, return a mock signature
    const signature = `0x${Buffer.from(message).toString('hex')}`;
    
    return NextResponse.json({ signature });
    
  } catch (error) {
    console.error('Sign message error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
