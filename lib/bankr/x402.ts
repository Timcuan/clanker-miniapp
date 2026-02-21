import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { getPublicClient } from '@/lib/blockchain/client';

// USDC Contract Address on Base Mainnet
export const USDC_ADDRESS_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Minimal ERC-20 ABI for USDC Transfer and Balance
const ERC20_ABI = [
    {
        inputs: [
            { name: '_to', type: 'address' },
            { name: '_value', type: 'uint256' },
        ],
        name: 'transfer',
        outputs: [{ name: '', type: 'bool' }],
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

// ETH needed for the swap itself: 0.0005 ETH + ~0.0001 ETH gas buffer
const ETH_FOR_SWAP = BigInt('500000000000000');   // 0.0005 ETH
const ETH_GAS_BUFFER = BigInt('200000000000000'); // 0.0002 ETH (generous gas buffer for Uniswap call)
const USDC_SWAP_MIN_OUTPUT = BigInt('1000000');    // 1.00 USDC minimum out (slippage floor)

export interface X402PaymentInfo {
    paymentAddress: string;
    amount: string; // in USD / USDC units
    tokenAddress: string;
    chainId: number;
}

export interface X402Response {
    success: boolean;
    data?: any;
    error?: string;
    txHash?: string; // x402 USDC payment tx (NOT the deployment tx)
}

/**
 * Executes a fetch request with automatic x402 Payment Required handling.
 */
export async function fetchWithX402(
    url: string,
    options: RequestInit,
    privateKey: string,
    customRpcUrl?: string
): Promise<X402Response> {
    try {
        console.log(`[x402] Initial request to ${url}`);
        const response = await fetch(url, options);

        if (response.status === 402) {
            console.log(`[x402] 402 Payment Required received`);

            const paymentAddress = response.headers.get('x-payment-address');
            const paymentAmount = response.headers.get('x-payment-amount');
            const paymentToken = response.headers.get('x-payment-token') || USDC_ADDRESS_BASE;

            if (!paymentAddress || !paymentAmount) {
                // Fallback: parse payment info from response body
                const bodyText = await response.text();
                try {
                    const body = JSON.parse(bodyText);
                    if (body.paymentAddress && body.amount) {
                        return await executePaymentAndRetry(url, options, privateKey, {
                            paymentAddress: body.paymentAddress,
                            amount: body.amount.toString(),
                            tokenAddress: body.tokenAddress || USDC_ADDRESS_BASE,
                            chainId: 8453,
                        }, customRpcUrl);
                    }
                } catch {
                    // body parse failed, throw below
                }
                throw new Error('x402: missing payment details in headers and body');
            }

            return await executePaymentAndRetry(url, options, privateKey, {
                paymentAddress, amount: paymentAmount, tokenAddress: paymentToken, chainId: 8453,
            }, customRpcUrl);
        }

        if (response.ok) {
            return { success: true, data: await response.json() };
        }

        throw new Error(`API returned ${response.status}: ${await response.text()}`);

    } catch (error) {
        console.error('[x402] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown x402 error',
        };
    }
}

/**
 * Sends the USDC payment and retries the original request with proof headers.
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

    const rpcUrl = customRpcUrl || process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const publicClient = getPublicClient(customRpcUrl);

    const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(rpcUrl),
    });

    const amountToTransfer = parseUnits(paymentInfo.amount, 6); // USDC = 6 decimals

    console.log(`[x402] Paying ${paymentInfo.amount} USDC → ${paymentInfo.paymentAddress}`);

    try {
        // Step 1: Ensure enough USDC (auto-swap ETH→USDC if needed)
        await ensureUsdcBalance(walletClient, publicClient, account.address, amountToTransfer, rpcUrl);

        // Step 2: Send USDC
        const paymentTxHash = await walletClient.writeContract({
            address: paymentInfo.tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [paymentInfo.paymentAddress as `0x${string}`, amountToTransfer],
        });

        console.log(`[x402] USDC payment submitted: ${paymentTxHash}`);
        await publicClient.waitForTransactionReceipt({ hash: paymentTxHash });
        console.log(`[x402] USDC payment confirmed`);

        // Step 3: Retry with proof
        const retryHeaders = new Headers(options.headers || {});
        retryHeaders.set('x-payment-proof', paymentTxHash);
        retryHeaders.set('x-payment-signature', paymentTxHash);

        console.log(`[x402] Retrying original request with payment proof...`);
        const retryResponse = await fetch(url, { ...options, headers: retryHeaders });

        if (!retryResponse.ok) {
            throw new Error(`Retry failed ${retryResponse.status}: ${await retryResponse.text()}`);
        }

        return { success: true, data: await retryResponse.json(), txHash: paymentTxHash };

    } catch (e) {
        console.error('[x402] Payment/retry failed:', e);
        throw new Error(`x402 payment failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/**
 * Ensures the wallet has enough USDC for the x402 fee.
 * Checks ETH balance can cover the swap before attempting it.
 * Verifies USDC landed after swap completes.
 */
async function ensureUsdcBalance(
    walletClient: any,
    publicClient: any,
    address: string,
    requiredAmount: bigint,
    rpcUrl: string
) {
    // 1. Read current USDC balance
    const usdcBalance = (await publicClient.readContract({
        address: USDC_ADDRESS_BASE as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
    })) as bigint;

    if (usdcBalance >= requiredAmount) {
        console.log(`[x402] USDC sufficient: ${formatUnits(usdcBalance, 6)} USDC`);
        return;
    }

    console.log(`[x402] USDC low (${formatUnits(usdcBalance, 6)}). Need to swap ETH→USDC...`);

    // 2. Check ETH balance covers swap + gas before attempting
    const ethBalance = await publicClient.getBalance({ address: address as `0x${string}` });
    const ethNeeded = ETH_FOR_SWAP + ETH_GAS_BUFFER;

    if (ethBalance < ethNeeded) {
        throw new Error(
            `Insufficient ETH for auto-swap. Have ${formatUnits(ethBalance, 18)} ETH, ` +
            `need at least ${formatUnits(ethNeeded, 18)} ETH (swap amount + gas).`
        );
    }

    // 3. Execute Uniswap V3 ETH→USDC swap
    const swapTxHash = await walletClient.writeContract({
        address: UNISWAP_V3_ROUTER as `0x${string}`,
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [{
            tokenIn: WETH_BASE as `0x${string}`,
            tokenOut: USDC_ADDRESS_BASE as `0x${string}`,
            fee: 500,               // 0.05% WETH/USDC pool on Base
            recipient: address as `0x${string}`,
            amountIn: ETH_FOR_SWAP,
            amountOutMinimum: USDC_SWAP_MIN_OUTPUT, // $1.00 floor — prevents sandwich
            sqrtPriceLimitX96: BigInt(0),
        }],
        value: ETH_FOR_SWAP,
    });

    console.log(`[x402] Swap tx submitted: ${swapTxHash}`);
    await publicClient.waitForTransactionReceipt({ hash: swapTxHash });
    console.log(`[x402] Swap confirmed`);

    // 4. Verify USDC actually arrived (swap output could be lower than required in edge cases)
    const usdcAfterSwap = (await publicClient.readContract({
        address: USDC_ADDRESS_BASE as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
    })) as bigint;

    if (usdcAfterSwap < requiredAmount) {
        throw new Error(
            `Swap completed but USDC still insufficient. ` +
            `Have ${formatUnits(usdcAfterSwap, 6)} USDC, need ${formatUnits(requiredAmount, 6)} USDC.`
        );
    }

    console.log(`[x402] USDC topped up: ${formatUnits(usdcAfterSwap, 6)} USDC`);
}

/**
 * Sweeps remaining USDC + ETH from burner wallet back to main wallet.
 * Uses EIP-1559 gas pricing, sweeps USDC first then ETH.
 */
export async function sweepFunds(
    burnerPrivateKey: string,
    mainWalletAddress: string,
    customRpcUrl?: string
): Promise<{ success: boolean }> {
    if (!/^0x[a-fA-F0-9]{64}$/.test(burnerPrivateKey)) {
        throw new Error('Invalid burner private key format');
    }

    const rpcUrl = customRpcUrl || process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
    const burnerAccount = privateKeyToAccount(burnerPrivateKey as `0x${string}`);
    const publicClient = getPublicClient(customRpcUrl);

    const walletClient = createWalletClient({
        account: burnerAccount,
        chain: base,
        transport: http(rpcUrl),
    });

    console.log(`[Sweep] ${burnerAccount.address} → ${mainWalletAddress}`);

    try {
        // ── 1. Sweep USDC first (so its gas cost is factored into ETH sweep calc) ──
        const usdcBalance = (await publicClient.readContract({
            address: USDC_ADDRESS_BASE as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [burnerAccount.address],
        })) as bigint;

        if (usdcBalance > BigInt(0)) {
            console.log(`[Sweep] Sweeping ${formatUnits(usdcBalance, 6)} USDC...`);
            const usdcTx = await walletClient.writeContract({
                address: USDC_ADDRESS_BASE as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'transfer',
                args: [mainWalletAddress as `0x${string}`, usdcBalance],
            });
            await publicClient.waitForTransactionReceipt({ hash: usdcTx });
            console.log(`[Sweep] USDC swept: ${usdcTx}`);
        }

        // ── 2. Sweep ETH (re-read balance after USDC sweep to get accurate remaining) ──
        const ethBalance = await publicClient.getBalance({ address: burnerAccount.address });

        if (ethBalance > BigInt(0)) {
            // EIP-1559 gas pricing
            let baseFeePerGas = BigInt(1_000_000); // 0.001 gwei fallback
            let priorityFeePerGas = BigInt(1_000_000); // 0.001 gwei fallback

            try {
                const block = await publicClient.getBlock({ blockTag: 'latest' });
                if (block.baseFeePerGas) baseFeePerGas = block.baseFeePerGas;

                // estimateMaxPriorityFeePerGas may not be on all clients — use try/catch
                try {
                    priorityFeePerGas = await publicClient.estimateMaxPriorityFeePerGas();
                } catch {
                    priorityFeePerGas = baseFeePerGas; // fallback: match base fee
                }
            } catch (gasErr) {
                console.warn('[Sweep] Gas estimation failed, using fallback values:', gasErr);
            }

            const maxFeePerGas = (baseFeePerGas * BigInt(2)) + priorityFeePerGas;
            const gasLimit = BigInt(21_000);
            const gasCost = gasLimit * maxFeePerGas;

            if (ethBalance > gasCost) {
                const sweepAmount = ethBalance - gasCost;
                console.log(`[Sweep] Sweeping ${formatUnits(sweepAmount, 18)} ETH...`);

                const ethTx = await walletClient.sendTransaction({
                    to: mainWalletAddress as `0x${string}`,
                    value: sweepAmount,
                    gas: gasLimit,
                    maxFeePerGas,
                    maxPriorityFeePerGas: priorityFeePerGas,
                });

                await publicClient.waitForTransactionReceipt({ hash: ethTx });
                console.log(`[Sweep] ETH swept: ${ethTx}`);
            } else {
                console.log(`[Sweep] ETH balance (${formatUnits(ethBalance, 18)}) below gas cost (${formatUnits(gasCost, 18)}). Dust left.`);
            }
        }

        console.log(`[Sweep] Complete`);
        return { success: true };

    } catch (e) {
        console.error('[Sweep] Failed:', e);
        return { success: false }; // non-fatal
    }
}
