import { createPublicClient, createWalletClient, http, parseUnits, getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { getPublicClient } from '@/lib/blockchain/client';

// USDC Contract Address on Base Mainnet
export const USDC_ADDRESS_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Minimal ERC-20 ABI for USDC Transfer and Balance
const ERC20_ABI = [
    {
        constant: false,
        inputs: [
            { name: '_to', type: 'address' },
            { name: '_value', type: 'uint256' },
        ],
        name: 'transfer',
        outputs: [{ name: '', type: 'bool' }],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    }
] as const;

// Uniswap V3 SwapRouter02 on Base
const UNISWAP_V3_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
const WETH_BASE = '0x4200000000000000000000000000000000000006';

const SWAP_ROUTER_ABI = [
    {
        inputs: [
            {
                components: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'fee', type: 'uint24' },
                    { name: 'recipient', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'amountOutMinimum', type: 'uint256' },
                    { name: 'sqrtPriceLimitX96', type: 'uint160' }
                ],
                name: 'params',
                type: 'tuple'
            }
        ],
        name: 'exactInputSingle',
        outputs: [{ name: 'amountOut', type: 'uint256' }],
        stateMutability: 'payable',
        type: 'function'
    }
] as const;

export interface X402PaymentInfo {
    paymentAddress: string;
    amount: string; // usually in USD
    tokenAddress: string;
    chainId: number;
}

export interface X402Response {
    success: boolean;
    data?: any;
    error?: string;
    txHash?: string; // If a payment was made
}

/**
 * Executes a fetch request that automatically handles x402 Payment Required challenges.
 * @param url The endpoint URL (e.g., https://api.bankr.bot/v2/prompt)
 * @param options Standard fetch options
 * @param privateKey The user's private key to fund the request
 * @param customRpcUrl Optional custom RPC for Base
 */
export async function fetchWithX402(
    url: string,
    options: RequestInit,
    privateKey: string,
    customRpcUrl?: string
): Promise<X402Response> {
    try {
        // 1. Initial Request
        console.log(`[x402] Initial request to ${url}`);
        let response = await fetch(url, options);

        // 2. Handle 402 Payment Required
        if (response.status === 402) {
            console.log(`[x402] Received 402 Payment Required`);

            // Extract payment details from headers
            // Expected headers: 
            // X-Payment-Address (the receiver)
            // X-Payment-Amount (e.g., "0.10" USDC)
            // X-Payment-Token (USDC address)
            const paymentAddress = response.headers.get('x-payment-address');
            const paymentAmount = response.headers.get('x-payment-amount');
            const paymentToken = response.headers.get('x-payment-token') || USDC_ADDRESS_BASE;

            if (!paymentAddress || !paymentAmount) {
                // Fallback: try parsing body if headers are omitted, Bankr sometimes puts it in the body
                const bodyText = await response.text();
                try {
                    const bodyJson = JSON.parse(bodyText);
                    if (bodyJson.paymentAddress && bodyJson.amount) {
                        return await executePaymentAndRetry(
                            url,
                            options,
                            privateKey,
                            {
                                paymentAddress: bodyJson.paymentAddress,
                                amount: bodyJson.amount.toString(),
                                tokenAddress: bodyJson.tokenAddress || USDC_ADDRESS_BASE,
                                chainId: 8453
                            },
                            customRpcUrl
                        );
                    }
                } catch (e) {
                    throw new Error('Missing payment headers or body details for x402 challenge.');
                }
                throw new Error('Missing x-payment-address or x-payment-amount headers.');
            }

            return await executePaymentAndRetry(
                url,
                options,
                privateKey,
                {
                    paymentAddress,
                    amount: paymentAmount,
                    tokenAddress: paymentToken,
                    chainId: 8453,
                },
                customRpcUrl
            );
        }

        // Handled successfully on first try (e.g. prompt costs $0 but returns 200)
        if (response.ok) {
            return { success: true, data: await response.json() };
        }

        throw new Error(`API returned ${response.status}: ${await response.text()}`);

    } catch (error) {
        console.error('[x402] Fetch error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error during x402 fetch' };
    }
}

/**
 * Executes the USDC transfer and retries the request with proof.
 */
async function executePaymentAndRetry(
    url: string,
    options: RequestInit,
    privateKey: string,
    paymentInfo: X402PaymentInfo,
    customRpcUrl?: string
): Promise<X402Response> {

    if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
        throw new Error('Invalid private key format');
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const publicClient = getPublicClient(customRpcUrl);

    const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(customRpcUrl || process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
    });

    console.log(`[x402] Initiating payment of ${paymentInfo.amount} USDC to ${paymentInfo.paymentAddress}`);

    // USDC has 6 decimals
    const amountToTransfer = parseUnits(paymentInfo.amount, 6);

    try {
        // 0. Ensure sufficient USDC balance by auto-swapping ETH if necessary
        await ensureUsdcBalance(walletClient, publicClient, account.address, amountToTransfer);

        // 1. Send Transaction
        const txHash = await walletClient.writeContract({
            address: paymentInfo.tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [paymentInfo.paymentAddress as `0x${string}`, amountToTransfer],
        });

        console.log(`[x402] USDC transfer submitted. TxHash: ${txHash}`);

        // Wait for receipt to ensure it's mined
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`[x402] USDC transfer confirmed.`);

        // 2. Retry the original request with the transaction hash
        // The x402 protocol expects the proof in the headers.
        const retryHeaders = new Headers(options.headers || {});
        retryHeaders.set('x-payment-proof', txHash);

        // Some implementations use Authorization or different headers
        // For Bankr, sending it as X-Payment-Signature or X-Payment-Hash is standard if `proof` fails
        retryHeaders.set('x-payment-signature', txHash);

        console.log(`[x402] Retrying request with payment proof...`);
        const retryResponse = await fetch(url, {
            ...options,
            headers: retryHeaders,
        });

        if (!retryResponse.ok) {
            throw new Error(`Retry failed with status ${retryResponse.status}: ${await retryResponse.text()}`);
        }

        const responseData = await retryResponse.json();
        return { success: true, data: responseData, txHash };

    } catch (e) {
        console.error('[x402] Payment execution or retry failed:', e);
        throw new Error(`Payment failed: ${e instanceof Error ? e.message : 'Unknown'}`);
    }
}

/**
 * Ensures the wallet has enough USDC to pay the x402 challenge.
 * If not, it automatically swaps a small amount of ETH (~$1.50) to USDC 
 * via Uniswap V3 to cover the $0.10 fee and future requests.
 */
async function ensureUsdcBalance(
    walletClient: any,
    publicClient: any,
    address: string,
    requiredAmount: bigint
) {
    // Check current USDC balance
    const balance = await publicClient.readContract({
        address: USDC_ADDRESS_BASE as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
    });

    if (balance >= requiredAmount) {
        console.log(`[x402] Sufficient USDC balance: ${balance.toString()}`);
        return;
    }

    console.log(`[x402] Insufficient USDC (${balance.toString()}). Auto-swapping ETH to USDC...`);

    // Swap ~0.0005 ETH (approx $1.50) for USDC to cover this and future requests
    // Using a small fixed amount avoids complex routing checks for a $0.10 payment.
    const ethToSwap = parseUnits('0.0005', 18);

    const swapParams = {
        tokenIn: WETH_BASE as `0x${string}`, // Uniswap V3 Auto-wraps native ETH when msg.value is provided
        tokenOut: USDC_ADDRESS_BASE as `0x${string}`,
        fee: 500, // 0.05% tier for WETH/USDC
        recipient: address as `0x${string}`,
        amountIn: ethToSwap,
        amountOutMinimum: BigInt(0), // Accept any amount for this tiny swap to guarantee success (slippage not a major concern here)
        sqrtPriceLimitX96: BigInt(0)
    };

    const txHash = await walletClient.writeContract({
        address: UNISWAP_V3_ROUTER as `0x${string}`,
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [swapParams],
        value: ethToSwap
    });

    console.log(`[x402] Auto-swap transaction submitted: ${txHash}`);

    // Wait for confirmation
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    console.log(`[x402] Auto-swap confirmed. USDC topped up.`);
}

/**
 * Sweeps all remaining USDC and ETH from the burner wallet back to the main wallet.
 * To be executed after a deployment completes (success or fail).
 */
export async function sweepFunds(
    burnerPrivateKey: string,
    mainWalletAddress: string,
    customRpcUrl?: string
): Promise<{ success: boolean }> {
    if (!/^0x[a-fA-F0-9]{64}$/.test(burnerPrivateKey)) {
        throw new Error('Invalid burner private key format');
    }

    const burnerAccount = privateKeyToAccount(burnerPrivateKey as `0x${string}`);
    const publicClient = getPublicClient(customRpcUrl);

    const walletClient = createWalletClient({
        account: burnerAccount,
        chain: base,
        transport: http(customRpcUrl || process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
    });

    console.log(`[Sweep] Initiating sweep from Burner (${burnerAccount.address}) to Main (${mainWalletAddress})`);

    try {
        // 1. Sweep USDC
        const usdcBalance = await publicClient.readContract({
            address: USDC_ADDRESS_BASE as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [burnerAccount.address as `0x${string}`],
        });

        if (usdcBalance > BigInt(0)) {
            console.log(`[Sweep] Found ${usdcBalance.toString()} USDC. Sweeping...`);
            const usdcTxHash = await walletClient.writeContract({
                address: USDC_ADDRESS_BASE as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'transfer',
                args: [mainWalletAddress as `0x${string}`, usdcBalance],
            });
            await publicClient.waitForTransactionReceipt({ hash: usdcTxHash });
            console.log(`[Sweep] USDC sweep confirmed: ${usdcTxHash}`);
        } else {
            console.log(`[Sweep] No USDC found to sweep.`);
        }

        // 2. Sweep ETH
        const ethBalance = await publicClient.getBalance({ address: burnerAccount.address });

        if (ethBalance > BigInt(0)) {
            console.log(`[Sweep] Found ${ethBalance.toString()} wei. Calculating gas to rescue...`);

            // Estimate Gas for standard ETH transfer (usually 21000, but let's be safe)
            const gasEstimate = await publicClient.estimateGas({
                account: burnerAccount,
                to: mainWalletAddress as `0x${string}`,
                value: BigInt(1), // dummy value just to estimate basic transfer
            });

            const gasPrice = await publicClient.getGasPrice();
            const sweepFee = gasEstimate * gasPrice;

            if (ethBalance > sweepFee) {
                const amountToSweep = ethBalance - sweepFee;
                console.log(`[Sweep] Sweeping ${amountToSweep.toString()} wei (Total - Gas)...`);

                const ethTxHash = await walletClient.sendTransaction({
                    to: mainWalletAddress as `0x${string}`,
                    value: amountToSweep,
                    gas: gasEstimate,
                    maxFeePerGas: gasPrice,
                });

                await publicClient.waitForTransactionReceipt({ hash: ethTxHash });
                console.log(`[Sweep] ETH sweep confirmed: ${ethTxHash}`);
            } else {
                console.log(`[Sweep] ETH balance (${ethBalance.toString()} wei) is too low to cover sweep gas (${sweepFee.toString()} wei). Dust remains.`);
            }
        } else {
            console.log(`[Sweep] No ETH found to sweep.`);
        }

        console.log(`[Sweep] Complete.`);
        return { success: true };
    } catch (e) {
        console.error('[Sweep] Error during fund sweeping operation:', e);
        // Do not throw here. Sweeping should not break the main UX if it fails.
        return { success: false };
    }
}
