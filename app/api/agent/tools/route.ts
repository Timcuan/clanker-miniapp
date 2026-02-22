import { NextRequest, NextResponse } from 'next/server';
import { MCP_TOOLS } from '@/lib/agent/mcp-schema';
import { getSessionFromRequest } from '@/lib/auth/session';
import { clankerService } from '@/lib/clanker/sdk';
import { bankrService } from '@/lib/bankr/sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { ipfsService } from '@/lib/ipfs/service';
import { decrypt } from '@/lib/serverless-db';
import { sweepFunds } from '@/lib/bankr/x402';
import { z } from 'zod';

const DeployTokenArgsSchema = z.object({
    name: z.string().min(1).max(50),
    symbol: z.string().min(1).max(10),
    image: z.string().optional(),
    description: z.string().optional(),
    feeType: z.enum(['dynamic', 'static', 'degen', 'low']).optional(),
    devBuyEth: z.number().optional()
});

const LaunchBankrArgsSchema = z.object({
    name: z.string().min(1).max(50),
    symbol: z.string().min(1).max(10),
    image: z.string().optional(),
    description: z.string().optional(),
    launcher: z.string().min(1),
    dashboardFee: z.string().min(1),
    taxType: z.enum(['dynamic', 'static']).optional(),
    taxPercentage: z.number().min(0).max(90).optional(),
    rewardRecipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/i).optional()
});

const UploadImageArgsSchema = z.object({
    imageData: z.string().min(1),
    filename: z.string().optional()
});

export async function GET(request: NextRequest) {
    return NextResponse.json({
        tools: MCP_TOOLS,
        protocol: 'mcp-1.0',
        server: 'Clanker-Agent-Bridge'
    });
}

export async function POST(request: NextRequest) {
    const session = await getSessionFromRequest(request);
    if (!session || !session.privateKey || !/^0x[a-fA-F0-9]{64}$/.test(session.privateKey)) {
        return NextResponse.json({ error: 'Unauthorized: Invalid Agent Key or corrupted session' }, { status: 401 });
    }

    try {
        const body = await request.json();

        // Support both direct REST args and JSON-RPC params mapping
        const toolName = body.params?.name || body.name;
        const args = body.params?.arguments || body.arguments || {};

        if (toolName === 'get_wallet') {
            return NextResponse.json({
                success: true,
                result: {
                    address: session.address,
                    telegramUserId: session.telegramUserId
                }
            });
        }

        if (toolName === 'get_deployments') {
            const limit = args.limit || 50;
            // Fetch directly from the global clanker api for speed, based on the wallet
            const userAddress = session.address;

            try {
                const globalRes = await fetch(`https://www.clanker.world/api/tokens?deployer=${userAddress}`);
                let tokens = [];
                if (globalRes.ok) {
                    const clankerData = await globalRes.json();
                    if (clankerData.data && Array.isArray(clankerData.data)) {
                        tokens = clankerData.data.slice(0, limit);
                    }
                }
                return NextResponse.json({
                    success: true,
                    result: {
                        count: tokens.length,
                        deployments: tokens
                    }
                });
            } catch (err: any) {
                return NextResponse.json({ error: 'Failed to fetch deployments' }, { status: 500 });
            }
        }

        if (toolName === 'upload_image') {
            const parsedArgs = UploadImageArgsSchema.safeParse(args);
            if (!parsedArgs.success) {
                return NextResponse.json({ error: 'Invalid arguments for upload_image', details: parsedArgs.error.errors }, { status: 400 });
            }
            const { imageData, filename } = parsedArgs.data;

            try {
                const result = await ipfsService.uploadImage(imageData, filename);
                return NextResponse.json({
                    success: true,
                    result
                });
            } catch (err: any) {
                return NextResponse.json({ error: `Image upload failed: ${err.message}` }, { status: 500 });
            }
        }

        if (toolName === 'deploy_token') {
            const parsedArgs = DeployTokenArgsSchema.safeParse(args);
            if (!parsedArgs.success) {
                return NextResponse.json({ error: 'Invalid arguments for deploy_token', details: parsedArgs.error.errors }, { status: 400 });
            }
            const validArgs = parsedArgs.data;

            const userAccount = privateKeyToAccount(session.privateKey as `0x${string}`);
            const result = await clankerService.deployToken(session.privateKey, {
                name: validArgs.name,
                symbol: validArgs.symbol,
                image: validArgs.image || '',
                description: validArgs.description || '',
                tokenAdmin: userAccount.address,
                rewardRecipient: userAccount.address,
            }, {
                feeType: validArgs.feeType || 'dynamic',
                devBuyEth: validArgs.devBuyEth,
                platform: 'telegram',
            });

            if (!result.success) {
                return NextResponse.json({ error: result.error }, { status: 400 });
            }

            return NextResponse.json({
                success: true,
                result: {
                    txHash: result.txHash,
                    tokenAddress: result.tokenAddress
                }
            });
        }

        if (toolName === 'launch_bankr') {
            const parsedArgs = LaunchBankrArgsSchema.safeParse(args);
            if (!parsedArgs.success) {
                return NextResponse.json({ error: 'Invalid arguments for launch_bankr', details: parsedArgs.error.errors }, { status: 400 });
            }
            const validArgs = parsedArgs.data;

            const userAccount = privateKeyToAccount(session.privateKey as `0x${string}`);

            // To simplify tool calling, bankr tool assumes caller will fund a burner natively or we just use their own account as burner (this is an MCP headless agent, so we can just use the user's account directly or generate one on the fly).
            // For headless agents, we just use their session as the burner and real wallet since they control it directly.
            const result = await bankrService.launchToken({
                name: validArgs.name,
                symbol: validArgs.symbol,
                image: validArgs.image,
                description: validArgs.description,
                launcherType: validArgs.launcher?.startsWith('0x') ? 'wallet' : 'x',
                launcher: validArgs.launcher,
                dashboardFeeType: validArgs.dashboardFee?.startsWith('0x') ? 'wallet' : 'x',
                dashboardFee: validArgs.dashboardFee,
                taxType: validArgs.taxType || 'dynamic',
                taxPercentage: validArgs.taxPercentage || 10,
                rewardRecipient: validArgs.rewardRecipient || userAccount.address,

                burnerWalletAddress: userAccount.address,
                realWalletAddress: userAccount.address,
            }, session.privateKey);

            if (!result.success) {
                return NextResponse.json({ error: result.error }, { status: 400 });
            }

            return NextResponse.json({
                success: true,
                result: {
                    txHash: result.txHash || result.txData?.hash,
                    message: result.message
                }
            });
        }

        if (toolName === 'recover_stuck_funds') {
            try {
                // We reuse the cleanup logic but scoped to the user's burners
                const { getUnsweptBurners, markBurnerStatus } = await import('@/lib/db/turso');
                const user = await (await import('@/lib/db/turso')).findUserByTelegramId(session.telegramUserId!);

                if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

                const burners = await getUnsweptBurners(user.id);
                const results = [];
                let totalRecovered = 0;

                for (const burner of burners) {
                    const privateKey = decrypt(burner.encrypted_pk);
                    if (!privateKey) continue;

                    const sweepRes = await sweepFunds(privateKey, session.address);
                    if (sweepRes.success) {
                        await markBurnerStatus(burner.address, 'swept');
                        totalRecovered++;
                        results.push({ address: burner.address, status: 'recovered', ethHash: sweepRes.ethHash });
                    }
                }

                return NextResponse.json({
                    success: true,
                    result: {
                        recovered: totalRecovered,
                        burners_processed: burners.length,
                        details: results
                    }
                });
            } catch (err: any) {
                return NextResponse.json({ error: `Recovery failed: ${err.message}` }, { status: 500 });
            }
        }

        return NextResponse.json({ error: `Tool ${toolName} not found or not supported yet.` }, { status: 404 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
