
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { decodeSession, getSessionCookieName } from '@/lib/serverless-db';
import { clankerService } from '@/lib/clanker/sdk';
import { bankrService } from '@/lib/bankr/sdk';
import { MevModuleType } from '@/lib/clanker/constants';
import { getSessionFromRequest } from '@/lib/auth/session';


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
    creatorReward: z.number().min(0).max(100),
    feeType: z.enum(['dynamic', 'static', 'degen', 'low']),
    poolPosition: z.enum(['Standard', 'Project']),
    mevProtection: z.nativeEnum(MevModuleType),
    blockDelay: z.number().min(0).max(20),
    devBuyEth: z.number().min(0),
    salt: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
    staticFeePercentage: z.number().min(0).max(50).optional(),
    customRpcUrl: z.string().url().optional(),
    vanity: z.boolean().optional(),

    // V4 Advanced Features
    vault: z.object({
        percentage: z.number().min(0).max(100),
        lockupDuration: z.number().min(0),
        vestingDuration: z.number().min(0),
        recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
    }).optional(),
    airdrop: z.object({
        amount: z.number().min(0),
        merkleRoot: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
        lockupDuration: z.number().min(0),
        vestingDuration: z.number().min(0),
        admin: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
    }).optional(),
    presale: z.object({
        bps: z.number().min(0).max(10000)
    }).optional(),
    poolExtension: z.object({
        address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        initData: z.string()
    }).optional(),
});

export async function POST(request: NextRequest) {
    try {
        const session = await getSessionFromRequest(request);
        if (!session || !session.privateKey) {
            return NextResponse.json({ error: 'Unauthorized: Invalid session or Agent Key. Please reconnect.' }, { status: 401 });
        }

        const body = await request.json();

        // Zod validation
        const result_val = DeploySchema.safeParse(body);
        if (!result_val.success) {
            return NextResponse.json({ error: 'Invalid input', details: result_val.error.errors }, { status: 400 });
        }

        const data = result_val.data;

        // ── Pre-flight Logging ────────────────────────────────────────────────
        let dbDeploymentId: number | undefined;
        try {
            const { findUserByTelegramId, createDeployment, updateDeployment } = await import('@/lib/db/turso');
            if (session.telegramUserId) {
                const user = await findUserByTelegramId(session.telegramUserId);
                if (user) {
                    const record = await createDeployment(user.id, data.name, data.symbol, data.image);
                    dbDeploymentId = record.id;
                    console.log(`[Deploy API] Pre-flight logged: ID ${dbDeploymentId}`);
                }
            }
        } catch (dbErr) {
            console.error('[Deploy API] Pre-flight logging failed (non-fatal):', dbErr);
        }

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
            salt: data.salt as `0x${string}` || undefined,
            staticFeePercentage: data.staticFeePercentage,
            vanity: data.vanity,
            customRpcUrl: data.customRpcUrl,

            // Advanced V4 Features
            vault: data.vault,
            airdrop: data.airdrop,
            presale: data.presale,
            poolExtension: data.poolExtension,

            // Context
            platform: 'telegram',
            telegramUserId: session.telegramUserId,
        });

        // ── Post-deployment Logging ───────────────────────────────────────────
        if (dbDeploymentId) {
            try {
                const { updateDeployment } = await import('@/lib/db/turso');
                await updateDeployment(dbDeploymentId, {
                    status: result.success ? 'success' : 'failed',
                    token_address: result.tokenAddress,
                    tx_hash: result.txHash,
                    error_message: result.success ? undefined : (result.error || 'Unknown deployment error'),
                });
            } catch (updateErr) {
                console.error('[Deploy API] Post-flight update failed:', updateErr);
            }
        }

        if (!result.success) {
            return NextResponse.json({ error: result.error || 'Deployment failed' }, { status: 400 });
        }

        // Fire-and-forget token indexing request to Bankr AI Agent
        // We do NOT await this, as we want to return the deploy response to the user instantly.
        bankrService.sendPrompt({
            prompt: `I just successfully deployed a new token via Clanker. Token Name: ${data.name}, Symbol: ${data.symbol}. The contract address is ${result.tokenAddress}. Please index this token, verify it, and make it available for trading on Bankr.`,
            walletAddress: session.address,
        }, session.privateKey).catch(err => {
            console.error('[Deploy API] Non-blocking Bankr token indexing failed:', err);
        });

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
