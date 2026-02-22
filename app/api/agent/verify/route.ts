import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
    const session = await getSessionFromRequest(request);

    if (!session) {
        return NextResponse.json({ valid: false, error: 'Invalid or missing X-Agent-Key. Please provide a valid key in the header.' }, { status: 401 });
    }

    return NextResponse.json({
        valid: true,
        address: session.address,
        telegramUserId: session.telegramUserId
    });
}
