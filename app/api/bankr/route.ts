import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { bankrService } from '@/lib/bankr/sdk';
import { z } from 'zod';

const BankrPromptSchema = z.object({
    prompt: z.string().min(1).max(500),
    customRpcUrl: z.string().url().optional(),
});

/**
 * POST /api/bankr
 * Main entry point for interacting with the Bankr AI Agent.
 * Requires an active, authenticated session with a decrypted private key.
 */
export async function POST(request: NextRequest) {
    try {
        // 1. Authenticate Request
        const session = await getSessionFromRequest(request);

        if (!session || !session.privateKey || !session.address) {
            return NextResponse.json(
                { error: 'Unauthorized: No active session or missing wallet.' },
                { status: 401 }
            );
        }

        // 2. Validate Payload
        const body = await request.json().catch(() => ({}));
        const result_val = BankrPromptSchema.safeParse(body);

        if (!result_val.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: result_val.error.errors },
                { status: 400 }
            );
        }

        const { prompt, customRpcUrl } = result_val.data;

        // 3. Forward to Bankr Service
        // The service will automatically handle the x402 USDC payment if requested by the API.
        const response = await bankrService.sendPrompt(
            {
                prompt,
                walletAddress: session.address,
                customRpcUrl
            },
            session.privateKey
        );

        if (!response.success) {
            return NextResponse.json(
                { error: response.error || 'Failed to communicate with Bankr agent' },
                { status: 502 }
            );
        }

        return NextResponse.json(response);

    } catch (error) {
        console.error('[API] Bankr route error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500 }
        );
    }
}
