
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
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

const DeploySchema = z.object({
    name: z.string().min(1).max(50),
    symbol: z.string().min(1).max(10),
    image: z.string().optional(),
    description: z.string().optional(),
    socialMediaUrls: z.array(z.object({
        platform: z.string(),
        url: z.string().url()
    })).optional(),
    tokenAdmin: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    rewardRecipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    creatorReward: z.number().min(0).max(80),
    feeType: z.enum(['dynamic', 'static', 'degen', 'low']),
    poolPosition: z.enum(['Standard', 'Project']),
    mevProtection: z.nativeEnum(MevModuleType),
    blockDelay: z.number().min(0).max(20),
    devBuyEth: z.number().min(0),
    salt: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
});

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

        // Zod validation
        const result_val = DeploySchema.safeParse(body);
        if (!result_val.success) {
            return NextResponse.json({ error: 'Invalid input', details: result_val.error.errors }, { status: 400 });
        }

        const data = result_val.data;

        // Call service to deploy
        const result = await clankerService.deployToken(session.privateKey, {
            ...data,
            image: data.image || '',
            description: data.description || '',
        }, {
            // Map data fields to options
            feeType: data.feeType,
            poolPositionType: data.poolPosition,
            mevModuleType: data.mevProtection,
            blockDelay: data.blockDelay,
            creatorReward: data.creatorReward,
            devBuyEth: data.devBuyEth,

            // Context
            platform: 'telegram',
            telegramUserId: session.telegramUserId,
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
