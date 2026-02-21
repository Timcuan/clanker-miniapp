import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { decodeSession, getSessionCookieName } from '@/lib/serverless-db';
import { getTelegramUserIdFromRequest } from '@/lib/auth/session';
import { sweepFunds } from '@/lib/bankr/x402';
import { sendAdminLog } from '@/lib/access-control';

const SweepSchema = z.object({
    burnerPrivateKey: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid private key format'),
});

export async function POST(request: NextRequest) {
    // 1. Auth
    try {
        const telegramUserId = await getTelegramUserIdFromRequest(request);
        const sessionCookieName = getSessionCookieName(telegramUserId);
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get(sessionCookieName)?.value;

        if (!sessionCookie) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const session = decodeSession(sessionCookie) as { address: string; privateKey: string } | null;
        if (!session?.address) {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
        }

        // 2. Validate body
        const body = await request.json();
        const result = SweepSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json({ error: 'Invalid private key' }, { status: 400 });
        }

        const { burnerPrivateKey } = result.data;

        console.log(`[Sweep API] Manual sweep request from ${session.address}`);

        // 3. Execute sweep — funds go to the authenticated user's main wallet
        const sweepResult = await sweepFunds(burnerPrivateKey, session.address);

        if (!sweepResult.success) {
            sendAdminLog(`⚠️ <b>Manual Sweep Failed</b>\nUser: <code>${session.address}</code>`);
            return NextResponse.json({ error: 'Sweep failed. Burner wallet may already be empty.' }, { status: 500 });
        }

        sendAdminLog(`🧹 <b>Manual Sweep Success</b>\nFunds returned to <code>${session.address.substring(0, 10)}...</code>`);

        return NextResponse.json({ success: true, message: 'Burner funds swept to your main wallet.' });

    } catch (error) {
        console.error('[Sweep API] Error:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Internal error'
        }, { status: 500 });
    }
}
