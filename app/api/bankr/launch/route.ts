import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { decodeSession, getSessionCookieName } from '@/lib/serverless-db';
import { bankrService } from '@/lib/bankr/sdk';
import { sweepFunds } from '@/lib/bankr/x402';
import { sendAdminLog } from '@/lib/access-control';
import { getTelegramUserIdFromRequest } from '@/lib/auth/session';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, parseEther } from 'viem';
import { base } from 'viem/chains';
import { getPublicClient } from '@/lib/blockchain/client';

// Server-side validation schema matching the frontend payload
const feeTypes = ['x', 'farcaster', 'ens', 'wallet'] as const;

const BankrLaunchSchema = z.object({
    name: z.string().min(1).max(50),
    symbol: z.string().min(1).max(10),
    image: z.string().url().optional(),
    tweet: z.string().url().optional(),
    cast: z.string().url().optional().or(z.literal('')),
    launcherType: z.enum(feeTypes),
    launcher: z.string().min(1),
    dashboardFeeType: z.enum(feeTypes),
    dashboardFee: z.string().min(1),
    taxType: z.enum(['dynamic', 'static']),
    taxPercentage: z.number().min(0).max(90),
    rewardRecipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/i),
    salt: z.string().optional(),
    description: z.string().optional(),
    telegram: z.string().url().optional().or(z.literal('')),
    website: z.string().url().optional().or(z.literal('')),
    autoSweep: z.boolean().optional(),
    customGasLimit: z.boolean().optional(),
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

        // --- Telegram Logging: Initialization ---
        sendAdminLog(`🚀 <b>Bankr Launch Started</b>\n\n<b>Token:</b> ${data.name} ($${data.symbol})\n<b>User:</b> <code>${session.address}</code>\n<b>Recipient:</b> <code>${data.rewardRecipient}</code>\n<b>Fee:</b> ${data.taxPercentage}% (${data.taxType})`);

        // 3. Execute Launch via Bankr SDK with Timeout & Retries
        // Set a 60 second timeout for the Bankr Agent (due to x402 payment + LLM processing)
        const BANKR_TIMEOUT_MS = 60000;
        const MAX_RETRIES = 3;

        let txHash: string | undefined;
        let message: string = '';
        const deployedViaFallback = false;

        console.log(`[Bankr Launch API] Setting up Burner Wallet Proxy for ${data.name}...`);

        // 3a. Generate Burner Wallet
        const burnerPk = generatePrivateKey();
        const burnerAccount = privateKeyToAccount(burnerPk);

        console.log(`[Bankr Setup] Created Burner Wallet: ${burnerAccount.address}`);

        // 3b. Fund Burner Wallet (0.0007 ETH) from User's Wallet
        const fundingAmount = parseEther('0.0007');
        const userAccount = privateKeyToAccount(session.privateKey as `0x${string}`);

        const walletClient = createWalletClient({
            account: userAccount,
            chain: base,
            transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
        });
        const publicClient = getPublicClient();

        console.log(`[Bankr Setup] Funding burner wallet...`);
        const fundingTxHash = await walletClient.sendTransaction({
            to: burnerAccount.address,
            value: fundingAmount,
        });

        await publicClient.waitForTransactionReceipt({ hash: fundingTxHash });
        console.log(`[Bankr Setup] Burner wallet funded successfully. Tx: ${fundingTxHash}`);

        sendAdminLog(`💳 <b>Burner Funded</b>\n<code>${burnerAccount.address}</code> received 0.0007 ETH.\n<a href="https://basescan.org/tx/${fundingTxHash}">View Tx</a>`);

        // 3c. Execute Launch via Bankr Agent using the Burner Key with Retry Loop
        let lastError: Error | null = null;

        try {
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    console.log(`[Bankr Launch API] Executing proxy request to Bankr... (Attempt ${attempt}/${MAX_RETRIES})`);
                    if (attempt > 1) {
                        sendAdminLog(`🔄 <b>Retry Attempt ${attempt}/${MAX_RETRIES}</b> for $${data.symbol}...`);
                    }
                    const bankrPromise = bankrService.launchToken({
                        name: data.name,
                        symbol: data.symbol,
                        image: data.image,
                        tweet: data.tweet,
                        cast: data.cast,
                        description: data.description,
                        telegram: data.telegram,
                        website: data.website,
                        launcherType: data.launcherType,
                        launcher: data.launcher,
                        dashboardFeeType: data.dashboardFeeType,
                        dashboardFee: data.dashboardFee,
                        taxType: data.taxType,
                        taxPercentage: data.taxPercentage,
                        rewardRecipient: data.rewardRecipient,
                        salt: data.salt,
                        burnerWalletAddress: burnerAccount.address,
                        realWalletAddress: session.address
                    }, burnerPk);

                    const timeoutPromise = new Promise<{ success: false, error: string }>((_, reject) =>
                        setTimeout(() => reject(new Error(`Bankr Agent Timeout after ${BANKR_TIMEOUT_MS}ms`)), BANKR_TIMEOUT_MS)
                    );

                    const result = await Promise.race([bankrPromise, timeoutPromise]) as any;

                    if (!result.success) {
                        throw new Error(result.error || 'Bankr launch failed to execute');
                    }

                    const txHashMatch = result.error ? result.error.match(/Payment Tx: (0x[a-fA-F0-9]+)/) : null;
                    txHash = txHashMatch ? txHashMatch[1] : (result.txData?.txHash || undefined);
                    message = result.message || 'Launch successfully submitted to Agent Bankr';
                    console.log(`[Bankr Launch API] AI Agent Success on attempt ${attempt}. Tx: ${txHash}`);

                    sendAdminLog(`✅ <b>Deployment Successful!</b>\n\n<b>Token:</b> ${data.name} ($${data.symbol})\n<b>Tx:</b> <a href="https://basescan.org/tx/${txHash}">${txHash?.substring(0, 10)}...</a>`);

                    // Success: Clear any residual errors and break loop
                    lastError = null;
                    break;

                } catch (bankrError) {
                    console.warn(`[Bankr Launch API] Agent Failed/Timed Out on attempt ${attempt}: ${bankrError}`);
                    lastError = bankrError instanceof Error ? bankrError : new Error(String(bankrError));

                    if (attempt < MAX_RETRIES) {
                        // Small delay before retrying
                        console.log(`[Bankr Launch API] Waiting 3s before retry...`);
                        await new Promise(r => setTimeout(r, 3000));
                    }
                }
            }

            if (lastError) {
                console.error(`[Bankr Launch API] All ${MAX_RETRIES} attempts failed. Giving up.`);
                throw lastError;
            }

            // 4. Return Success
            return NextResponse.json({
                success: true,
                message,
                txHash,
                deployedViaFallback,
            });
        } finally {
            // Sweep leftover ETH and USDC out of the burner wallet back to main wallet if enabled
            if (data.autoSweep !== false) {
                console.log(`[Bankr Launch API] Automatically Sweeping Burner Wallet leftover funds...`);
                try {
                    const sweepResult = await sweepFunds(burnerPk, session.address);
                    if (sweepResult?.success) {
                        sendAdminLog(`🧹 <b>Funds Swept</b>\nResidual funds returned to <code>${session.address.substring(0, 8)}...</code>`);
                    }
                } catch (sweepError) {
                    console.error('[Sweep Error]', sweepError);
                }
            } else {
                console.log(`[Bankr Launch API] Auto-Sweep disabled via Settings. Funds remain in: ${burnerAccount.address}`);
                sendAdminLog(`⚠️ <b>Sweep Skipped</b>\nFunds remain in burner: <code>${burnerAccount.address}</code>`);
            }
        }

    } catch (error) {
        console.error('[Bankr Launch API] error:', error);

        // Return 402 if it's explicitly a payment failure to allow frontend to handle it cleanly if needed
        const status = error instanceof Error && error.message.includes('Payment failed') ? 402 : 500;

        sendAdminLog(`❌ <b>Launch Failed</b>\n<b>Error:</b> ${error instanceof Error ? error.message : 'Unknown'}`);

        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Internal server error'
        }, { status });
    }
}
