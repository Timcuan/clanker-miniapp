import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { decodeSession, getSessionCookieName } from '@/lib/serverless-db';
import { bankrService } from '@/lib/bankr/sdk';
import { clankerService } from '@/lib/clanker/sdk';
import { MevModuleType } from '@/lib/clanker/constants';
import { getTelegramUserIdFromRequest } from '@/lib/auth/session';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, parseEther } from 'viem';
import { base } from 'viem/chains';
import { getPublicClient } from '@/lib/blockchain/client';

// Server-side validation schema matching the frontend payload
const feeTypes = ['x', 'farcaster', 'ens', 'wallet'] as const;

const BankrLaunchSchema = z.object({
    name: z.string().min(1).max(50),
    image: z.string().url().optional(),
    tweet: z.string().url().optional(),
    launcherType: z.enum(feeTypes),
    launcher: z.string().min(1),
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

        // 3. Execute Launch via Bankr SDK with Timeout
        // Set a 20 second timeout for the Bankr Agent (due to x402 payment + LLM processing)
        const BANKR_TIMEOUT_MS = 20000;

        let txHash: string | undefined;
        let message: string;
        let deployedViaFallback = false;

        try {
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

            // 3c. Execute Launch via Bankr Agent using the Burner Key
            console.log(`[Bankr Launch API] Executing proxy request to Bankr...`);
            const bankrPromise = bankrService.launchToken({
                name: data.name,
                image: data.image,
                tweet: data.tweet,
                launcherType: data.launcherType,
                launcher: data.launcher,
                feeType: data.feeType,
                fee: data.fee,
                burnerWalletAddress: burnerAccount.address,
                realWalletAddress: session.address
            }, burnerPk);

            const timeoutPromise = new Promise<{ success: false, error: string }>((_, reject) =>
                setTimeout(() => reject(new Error('Bankr Agent Timeout')), BANKR_TIMEOUT_MS)
            );

            const result = await Promise.race([bankrPromise, timeoutPromise]) as any;

            if (!result.success) {
                throw new Error(result.error || 'Bankr launch failed to execute');
            }

            const txHashMatch = result.error ? result.error.match(/Payment Tx: (0x[a-fA-F0-9]+)/) : null;
            txHash = txHashMatch ? txHashMatch[1] : (result.txData?.txHash || undefined);
            message = result.message || 'Launch successfully submitted to Agent Bankr';
            console.log(`[Bankr Launch API] AI Agent Success. Tx: ${txHash}`);

        } catch (bankrError) {
            console.warn(`[Bankr Launch API] Agent Failed/Timed Out (${bankrError}). Falling back to Native Clanker...`);

            // --- SMART FALLBACK TO NATIVE CLANKER CONTROLS ---
            deployedViaFallback = true;

            const isWalletRegex = /^0x[a-fA-F0-9]{40}$/i;

            // Prevent assigning tokenAdmin to a Twitter handle, which breaks the Clanker Smart Contract Native Call
            const fallbackTokenAdmin = (data.launcherType === 'wallet' && isWalletRegex.test(data.launcher))
                ? data.launcher
                : session.address;

            // Attempt to map the fee recipient if it's a valid wallet, otherwise fallback to the user's address
            const fallbackFeeRecipient = (data.feeType === 'wallet' && isWalletRegex.test(data.fee))
                ? data.fee
                : session.address;

            const fallbackResult = await clankerService.deployToken(session.privateKey, {
                name: data.name,
                symbol: data.name.substring(0, 5).toUpperCase(), // Generate short symbol
                image: data.image || '',
                description: `Created via UMKM Terminal (Fallback Mode)`,
                socialMediaUrls: data.tweet ? [{ platform: 'x', url: data.tweet }] : [],
                tokenAdmin: fallbackTokenAdmin,
                rewardRecipient: fallbackFeeRecipient,
            }, {
                feeType: 'static',
                poolPositionType: 'Standard',
                mevModuleType: MevModuleType.None,
                blockDelay: 0,
                creatorReward: 0,
                devBuyEth: 0,
                platform: 'telegram',
                telegramUserId: session.telegramUserId,
            });

            if (!fallbackResult.success) {
                throw new Error(`Fallback Native Deployment also failed: ${fallbackResult.error}`);
            }

            txHash = fallbackResult.txHash;
            message = 'Agent Bankr was unreachable. The token was securely launched via Native Clanker Smart Contracts on-chain.';
            console.log(`[Bankr Launch API] Native Clanker Fallback Success. Tx: ${txHash}`);
        }

        // 4. Return Success
        return NextResponse.json({
            success: true,
            message,
            txHash,
            deployedViaFallback,
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
