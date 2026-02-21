import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { decodeSession, getSessionCookieName } from '@/lib/serverless-db';
import { bankrService } from '@/lib/bankr/sdk';
import { getTelegramUserIdFromRequest } from '@/lib/auth/session';

// Server-side validation schema matching the frontend payload
const feeTypes = ['x', 'farcaster', 'ens', 'wallet'] as const;

const BankrLaunchSchema = z.object({
    name: z.string().min(1).max(50),
    image: z.string().url().optional(),
    tweet: z.string().url().optional(),
    feeType: z.enum(feeTypes),
    fee: z.string().min(1),
});

export async function POST(request: NextRequest) {
    try {
        // 1. Session Authentication & Authorization
        const telegramUserId = await getTelegramUserIdFromRequest(request);
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

        // 2. Parse and Validate Request Body
        const body = await request.json();

        const validationResult = BankrLaunchSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({
                error: 'Invalid input',
                details: validationResult.error.errors
            }, { status: 400 });
        }

        const data = validationResult.data;

        // 3. Execute Launch via Bankr SDK
        // This will trigger the x402 payment flow (or auto-swap logic) seamlessly inside the SDK
        const result = await bankrService.launchToken({
            name: data.name,
            image: data.image,
            tweet: data.tweet,
            feeType: data.feeType,
            fee: data.fee,
            walletAddress: session.address
        }, session.privateKey);

        if (!result.success) {
            return NextResponse.json({ error: result.error || 'Bankr launch failed to execute' }, { status: 400 });
        }

        // 4. Return Success
        const txHashMatch = result.error ? result.error.match(/Payment Tx: (0x[a-fA-F0-9]+)/) : null;
        const txHash = txHashMatch ? txHashMatch[1] : (result.txData?.txHash || undefined);

        return NextResponse.json({
            success: true,
            message: result.message || 'Launch successfully submitted to Agent Bankr',
            txHash: txHash,
        });

    } catch (error) {
        console.error('[Bankr Launch API] error:', error);

        // Return 402 if it's explicitly a payment failure to allow frontend to handle it cleanly if needed
        const status = error instanceof Error && error.message.includes('Payment failed') ? 402 : 500;

        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Internal server error'
        }, { status });
    }
}
