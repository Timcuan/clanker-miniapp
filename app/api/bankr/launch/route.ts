import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { decodeSession, getSessionCookieName } from '@/lib/serverless-db';
import { bankrService } from '@/lib/bankr/sdk';
import { clankerService, MevModuleType } from '@/lib/clanker/sdk';
import { sweepFunds } from '@/lib/bankr/x402';
import { sendAdminLog } from '@/lib/access-control';
import { getSessionFromRequest } from '@/lib/auth/session';
import { encrypt } from '@/lib/serverless-db';
import { findUserByTelegramId, registerBurner, markBurnerStatus, updateBurnerFunding } from '@/lib/db/turso';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, parseEther, formatEther } from 'viem';
import { base } from 'viem/chains';
import { getPublicClient } from '@/lib/blockchain/client';

// ─── Schema ───────────────────────────────────────────────────────────────────
const feeTypes = ['x', 'farcaster', 'ens', 'wallet'] as const;

const BankrLaunchSchema = z.object({
    name: z.string().min(1).max(50),
    symbol: z.string().min(1).max(10),
    image: z.string().optional(),
    tweet: z.string().optional(),
    cast: z.string().optional(),
    launcherType: z.enum(feeTypes),
    launcher: z.string().min(1),
    dashboardFeeType: z.enum(feeTypes),
    dashboardFee: z.string().min(1),
    taxType: z.enum(['dynamic', 'static']),
    taxPercentage: z.number().min(0).max(90),
    rewardRecipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/i),
    description: z.string().optional(),
    website: z.string().optional(),
    autoSweep: z.boolean().optional().default(true),
    vanityEnabled: z.boolean().optional().default(false),
    vanitySuffix: z.string().max(8).optional(),
});

// ─── Constants ─────────────────────────────────────────────────────────────────
const BANKR_TIMEOUT_MS = 90_000; // 90s – x402 payment + LLM latency
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 4_000;
// 0.0007 ETH to fund burner + headroom for funding tx gas + swap inside burner + swap gas
const FUNDING_AMOUNT_ETH = '0.0007';
// Minimum: funding (0.0007) + funding tx gas (~0.00003) + swap budget (0.0005) + swap gas (~0.00003)
const MIN_USER_BALANCE_ETH = '0.0015';

export async function POST(request: NextRequest) {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    let session: { address: string; privateKey: string; telegramUserId?: number } | null = null;

    try {
        const decoded = await getSessionFromRequest(request);
        if (!decoded || !decoded.privateKey) {
            return NextResponse.json({ error: 'Unauthorized: Invalid session or Agent Key. Please reconnect.' }, { status: 401 });
        }
        session = decoded as { address: string; privateKey: string; telegramUserId?: number };
    } catch (authError) {
        console.error('[Bankr Auth Error]', authError);
        return NextResponse.json({ error: 'Authentication error. Please reconnect.' }, { status: 401 });
    }

    // ── 2. Validate Input ────────────────────────────────────────────────────
    let data: z.infer<typeof BankrLaunchSchema>;
    try {
        const body = await request.json();
        const result = BankrLaunchSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json({
                error: 'Invalid input',
                details: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
            }, { status: 400 });
        }
        data = result.data;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // ── 3. Pre-flight Balance Check ──────────────────────────────────────────
    const publicClient = getPublicClient();
    const userAccount = privateKeyToAccount(session.privateKey as `0x${string}`);

    try {
        const userBalance = await publicClient.getBalance({ address: userAccount.address });
        const minBalanceWei = parseEther(MIN_USER_BALANCE_ETH);

        if (userBalance < minBalanceWei) {
            const balanceEth = formatEther(userBalance);
            return NextResponse.json({
                error: `Insufficient ETH balance. You have ${parseFloat(balanceEth).toFixed(6)} ETH but need at least ${MIN_USER_BALANCE_ETH} ETH to cover the burner wallet funding.`
            }, { status: 402 });
        }
    } catch (balanceError) {
        console.warn('[Bankr] Could not check user balance:', balanceError);
        // Non-fatal: proceed and let the funding TX fail naturally
    }

    sendAdminLog(`🚀 <b>Bankr Launch Started</b>\n\n<b>Token:</b> ${data.name} ($${data.symbol})\n<b>User:</b> <code>${userAccount.address}</code>\n<b>Recipient:</b> <code>${data.rewardRecipient}</code>\n<b>Tax:</b> ${data.taxPercentage}% (${data.taxType})`);

    // ── 4. Setup Burner Wallet ───────────────────────────────────────────────
    const burnerPk = generatePrivateKey();
    const burnerAccount = privateKeyToAccount(burnerPk);
    let burnerDbId: number | undefined;

    console.log(`[Bankr] Created burner wallet: ${burnerAccount.address}`);

    // Pre-calculate dynamic funding based on current gas
    let dynamicFundingEth = FUNDING_AMOUNT_ETH;
    try {
        const gasPrice = await publicClient.getGasPrice();
        // Budget calculation:
        // 0.0006 ETH base budget (swap + liquidity)
        // 150,000 gas limit for hops * gasPrice * 1.5 safety
        const gasBudget = (gasPrice * BigInt(150_000) * BigInt(15)) / BigInt(10);
        const totalWei = parseEther('0.0006') + gasBudget;
        dynamicFundingEth = formatEther(totalWei);
        console.log(`[Bankr] Dynamic funding calculated: ${dynamicFundingEth} ETH (Gas price: ${formatEther(gasPrice)} ETH)`);
    } catch (gasErr) {
        console.warn('[Bankr] Dynamic gas calculation failed, using fallback:', gasErr);
    }


    const walletClient = createWalletClient({
        account: userAccount,
        chain: base,
        transport: http(process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
    });

    // ── 5. Fund Burner Wallet ────────────────────────────────────────────────
    try {
        console.log(`[Bankr] Funding burner wallet with ${dynamicFundingEth} ETH...`);

        // Nonce Management: Get latest nonce to avoid collisions
        const nonce = await publicClient.getTransactionCount({ address: userAccount.address, blockTag: 'pending' });

        const fundingTxHash = await walletClient.sendTransaction({
            to: burnerAccount.address,
            value: parseEther(dynamicFundingEth),
            nonce,
        });

        // ── Coordinated Persistence (Update DB with hash before awaiting) ────
        if (session.telegramUserId) {
            try {
                const user = await findUserByTelegramId(session.telegramUserId);
                if (user) {
                    burnerDbId = await registerBurner(user.id, burnerAccount.address, encrypt(burnerPk), dynamicFundingEth, fundingTxHash);
                    console.log(`[Bankr] Burner registered with TX hash: ${fundingTxHash}`);

                    // Notify user via Telegram
                    const { sendUserLog } = await import('@/lib/access-control');
                    sendUserLog(session.telegramUserId,
                        `🛡️ <b>Burner Wallet Created & Funding Sent</b>\n\n` +
                        `Funding of <code>${dynamicFundingEth}</code> ETH has been broadcast to your burner wallet.\n\n` +
                        `📍 <b>Address:</b> <code>${burnerAccount.address}</code>\n` +
                        `🔑 <b>Private Key:</b> <code>${burnerPk}</code>\n` +
                        `🔗 <b>Funding Tx:</b> <a href="https://basescan.org/tx/${fundingTxHash}">${fundingTxHash.substring(0, 10)}...</a>\n\n` +
                        `<i>We are now awaiting network confirmation...</i>`
                    );
                }
            } catch (dbErr) {
                console.error('[Bankr] Coordinated persistence failed:', dbErr);
            }
        }

        await publicClient.waitForTransactionReceipt({ hash: fundingTxHash, timeout: 60_000 });
        console.log(`[Bankr] Burner funded. Tx: ${fundingTxHash}`);

        sendAdminLog(`💳 <b>Burner Funded</b>\n<code>${burnerAccount.address}</code> received ${dynamicFundingEth} ETH.\n<a href="https://basescan.org/tx/${fundingTxHash}">View Tx</a>`);
    } catch (fundError) {
        console.error('[Bankr] Burner wallet funding failed:', fundError);
        sendAdminLog(`❌ <b>Burner Funding Failed</b>\n${fundError instanceof Error ? fundError.message : 'Unknown error'}`);
        return NextResponse.json({
            error: `Failed to fund burner wallet: ${fundError instanceof Error ? fundError.message : 'Transaction rejected'}`
        }, { status: 500 });
    }

    // ── 6. Execute Agent + Retry Loop ────────────────────────────────────────
    let txHash: string | undefined;
    let resultMessage = '';
    let deployedViaFallback = false;
    let agentSuccess = false;
    let lastAgentError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`[Bankr] Retry attempt ${attempt}/${MAX_RETRIES}...`);
                sendAdminLog(`🔄 <b>Retry ${attempt}/${MAX_RETRIES}</b> for $${data.symbol}...`);
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            }

            console.log(`[Bankr] Agent attempt ${attempt}/${MAX_RETRIES}...`);

            const bankrPromise = bankrService.launchToken({
                name: data.name,
                symbol: data.symbol,
                image: data.image,
                tweet: data.tweet,
                cast: data.cast,
                description: data.description,
                website: data.website,
                launcherType: data.launcherType,
                launcher: data.launcher,
                dashboardFeeType: data.dashboardFeeType,
                dashboardFee: data.dashboardFee,
                taxType: data.taxType,
                taxPercentage: data.taxPercentage,
                rewardRecipient: data.rewardRecipient,
                vanitySuffix: (data.vanityEnabled && data.vanitySuffix) ? data.vanitySuffix : undefined,

                burnerWalletAddress: burnerAccount.address,
                realWalletAddress: userAccount.address,
            }, burnerPk);

            // Timeout wrapper with cleanup to avoid dangling timers across retries
            let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutHandle = setTimeout(
                    () => reject(new Error(`Bankr Agent timed out after ${BANKR_TIMEOUT_MS / 1000}s`)),
                    BANKR_TIMEOUT_MS
                );
            });

            let result: any;
            try {
                result = await Promise.race([bankrPromise, timeoutPromise]);
            } finally {
                if (timeoutHandle !== null) clearTimeout(timeoutHandle);
            }

            if (!result || !result.success) {
                throw new Error(result?.error || 'Bankr agent returned a failure response');
            }

            // Extract tx hash - sdk.ts now extracts from Bankr API response body
            // Fallback chain: result.txHash (from sdk multi-key extract) → txData → regex on message
            const txHashFromData = result.txData?.txHash ?? result.txData?.transactionHash
                ?? result.txData?.tx_hash ?? result.txData?.hash
                ?? result.txData?.data?.txHash;
            const txHashFromMsg = result.message?.match(/0x[a-fA-F0-9]{64}/i)?.[0];
            txHash = result.txHash ?? txHashFromData ?? txHashFromMsg;
            resultMessage = result.message || 'Token successfully launched via Bankr Agent.';

            console.log(`[Bankr] Agent succeeded on attempt ${attempt}. Tx: ${txHash}`);
            sendAdminLog(
                `✅ <b>Bankr Agent Success!</b>\n\n` +
                `<b>Token:</b> ${data.name} ($${data.symbol})\n` +
                `<b>Tax:</b> ${data.taxType.toUpperCase()}${data.taxType === 'static' ? ` ${data.taxPercentage}%` : ''}\n` +
                (data.vanityEnabled ? `<b>Vanity:</b> ...${data.vanitySuffix}\n` : '') +
                `<b>Tx:</b> <a href="https://basescan.org/tx/${txHash}">${txHash ? txHash.substring(0, 14) + '...' : 'pending'}</a>`
            );


            agentSuccess = true;
            lastAgentError = null;
            break;

        } catch (agentError) {
            console.warn(`[Bankr] Agent attempt ${attempt} failed:`, agentError);
            lastAgentError = agentError instanceof Error ? agentError : new Error(String(agentError));
        }
    }

    // ── 7. Clanker SDK Fallback ──────────────────────────────────────────────
    if (!agentSuccess) {
        console.error(`[Bankr] All ${MAX_RETRIES} agent attempts failed. Initiating Clanker SDK Fallback...`);
        sendAdminLog(`⚠️ <b>Agent Failed (${MAX_RETRIES} attempts)</b>. Falling back to Clanker SDK for $${data.symbol}...`);

        try {
            const fallbackResult = await clankerService.deployToken(burnerPk, {
                name: data.name,
                symbol: data.symbol,
                image: data.image || '',
                description: data.description || '',
                tokenAdmin: userAccount.address,
                rewardRecipient: data.rewardRecipient,
            }, {
                feeType: data.taxType === 'static' ? 'static' : 'dynamic',
                staticFeePercentage: data.taxType === 'static' ? data.taxPercentage : undefined,
                poolPositionType: 'Standard',
                mevModuleType: MevModuleType.BlockDelay,
                blockDelay: 2,
                platform: 'telegram',

            });

            if (!fallbackResult.success) {
                throw new Error(fallbackResult.error || 'Clanker fallback deployment failed');
            }

            txHash = fallbackResult.txHash;
            resultMessage = 'Bankr Agent was unavailable. Token successfully launched via Clanker SDK fallback.';
            deployedViaFallback = true;

            sendAdminLog(`✅ <b>Clanker Fallback Successful!</b>\n<b>Token:</b> ${data.name} ($${data.symbol})\n<b>Tx:</b> <a href="https://basescan.org/tx/${txHash}">${txHash?.substring(0, 12)}...</a>`);

        } catch (fallbackError) {
            console.error('[Bankr] Clanker fallback also failed:', fallbackError);
            sendAdminLog(`❌ <b>All Methods Failed</b>\n<b>Agent Error:</b> ${lastAgentError?.message}\n<b>Fallback Error:</b> ${fallbackError instanceof Error ? fallbackError.message : 'Unknown'}`);

            // Sweep before returning error (funds still in burner)
            if (data.autoSweep) {
                sweepFunds(burnerPk, userAccount.address).catch(e => console.error('[Sweep on error]', e));
            }

            return NextResponse.json({
                error: `Deployment failed on all channels. Agent: "${lastAgentError?.message}". Fallback: "${fallbackError instanceof Error ? fallbackError.message : 'Unknown'}"`
            }, { status: 500 });
        }
    }

    // ── 8. Sweep Burner Wallet (async, non-blocking) ─────────────────────────
    if (data.autoSweep) {
        console.log('[Bankr] Auto-sweeping burner wallet residuals...');
        // Fire and forget – don't block the success response
        sweepFunds(burnerPk, userAccount.address)
            .then(r => {
                if (r.success) {
                    markBurnerStatus(burnerAccount.address, 'swept').catch(e => console.error('[Sweep Status Update Error]', e));
                    sendAdminLog(`🧹 <b>Funds Swept</b>\nResiduals returned to <code>${userAccount.address.substring(0, 10)}...</code>`);
                }
            })
            .catch(e => console.error('[Sweep Error]', e));
    } else {
        sendAdminLog(`⚠️ <b>Sweep Skipped</b>\nFunds remain in burner: <code>${burnerAccount.address}</code>`);
    }

    // ── 9. Return Success ─────────────────────────────────────────────────────
    return NextResponse.json({
        success: true,
        message: resultMessage,
        txHash,
        deployedViaFallback,
        burnerAddress: burnerAccount.address, // For client-side burner log tracking
    });
}
