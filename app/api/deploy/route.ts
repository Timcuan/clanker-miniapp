
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decodeSession, getSessionCookieName } from '@/lib/serverless-db';
import { clankerService } from '@/lib/clanker/sdk';
import { MevModuleType } from '@/lib/clanker/constants';

// Helper to get Telegram user ID from request headers or query
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

export async function POST(request: NextRequest) {
    try {
        const telegramUserId = getTelegramUserId(request);
        const sessionCookieName = getSessionCookieName(telegramUserId);

        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get(sessionCookieName)?.value;

        if (!sessionCookie) {
            return NextResponse.json({ error: 'Unauthorized: No session found. Please reconnect.' }, { status: 401 });
        }

        const session = decodeSession(sessionCookie);
        if (!session || !session.privateKey) {
            return NextResponse.json({ error: 'Unauthorized: Invalid session. Please reconnect.' }, { status: 401 });
        }

        const body = await request.json();

        // Basic validation
        if (!body.name || !body.symbol) {
            return NextResponse.json({ error: 'Name and Symbol are required' }, { status: 400 });
        }

        // Call service to deploy
        const result = await clankerService.deployToken(session.privateKey, body, {
            // Map body fields to options
            feeType: body.feeType,
            poolPositionType: body.poolPosition,
            mevModuleType: body.mevProtection as MevModuleType,
            blockDelay: body.blockDelay,
            creatorReward: body.creatorReward,
            devBuyEth: body.devBuyEth,

            // Context
            platform: 'telegram',
            telegramUserId: session.telegramUserId || session.telegramId,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error || 'Deployment failed' }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            txHash: result.txHash,
            tokenAddress: result.tokenAddress,
            verified: true,
            id: result.txHash,
        });

    } catch (error) {
        console.error('Deploy API error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
    }
}
