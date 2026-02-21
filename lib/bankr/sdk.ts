/**
 * Bankr v2 SDK Integration (Custom x402 Implementation)
 * This handles the interaction with Bankr AI trading agent manually
 * due to upstream NPM package issues.
 *
 * Payment Protocol: x402 ($0.10 in USDC per request on Base)
 */

import { fetchWithX402, X402Response } from './x402';

export interface BankrPromptConfig {
    prompt: string;
    walletAddress: string;
    customRpcUrl?: string;
}

export interface BankrResponse {
    success: boolean;
    message?: string;
    txData?: any;
    txHash?: string;
    error?: string;
}

// Try to extract a tx hash from any common key the Bankr API might use
function extractTxHash(data: any): string | undefined {
    if (!data || typeof data !== 'object') return undefined;
    // Try direct keys first
    const direct = data.txHash ?? data.transactionHash ?? data.tx_hash ?? data.hash;
    if (direct && typeof direct === 'string' && /^0x[a-fA-F0-9]{64}$/i.test(direct)) return direct;
    // Try nested shapes Bankr API sometimes wraps in
    const nested = data.data?.txHash ?? data.data?.transactionHash ?? data.result?.txHash
        ?? data.transaction?.hash ?? data.tx?.hash;
    if (nested && typeof nested === 'string' && /^0x[a-fA-F0-9]{64}$/i.test(nested)) return nested;
    // Last resort: scan message text for a 32-byte hex string
    const msg: string | undefined = data.message ?? data.msg ?? data.text;
    if (msg) {
        const m = msg.match(/0x[a-fA-F0-9]{64}/);
        if (m) return m[0];
    }
    return undefined;
}

export class BankrService {
    private apiUrl: string = 'https://api.bankr.bot/v2';

    constructor(private apiKey?: string) { }

    /**
     * Sends a prompt to the Bankr AI agent.
     * Handles x402 payment automatically.
     */
    async sendPrompt(config: BankrPromptConfig, privateKey: string): Promise<BankrResponse> {
        try {
            console.log(`[Bankr] Sending prompt for wallet ${config.walletAddress}`);

            const endpoint = `${this.apiUrl}/prompt`;

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            };

            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`;
            }

            const result: X402Response = await fetchWithX402(
                endpoint,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        walletAddress: config.walletAddress,
                        prompt: config.prompt,
                    }),
                },
                privateKey,
                config.customRpcUrl
            );

            if (!result.success) {
                return {
                    success: false,
                    error: result.error ?? 'Bankr request failed during x402 negotiation',
                };
            }

            // Extract the actual deployment tx hash from the Bankr API response body
            const responseData = result.data;
            const deployTxHash = extractTxHash(responseData);

            // Try to get a meaningful message from the response, fall back to generic
            const responseMessage: string =
                responseData?.message ??
                responseData?.msg ??
                responseData?.text ??
                'Token launch successfully dispatched via Bankr Agent.';

            return {
                success: true,
                message: responseMessage,
                txData: responseData,
                txHash: deployTxHash,          // ← actual deployment tx, not the x402 payment tx
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Bankr request failed unexpectedly',
            };
        }
    }

    /**
     * Executes a token launch using the Bankr Agent,
     * mimicking the @bankr/cli 'launch' command via natural-language prompt.
     */
    async launchToken(params: {
        name: string;
        symbol: string;
        image?: string;
        tweet?: string;
        cast?: string;
        description?: string;
        website?: string;
        launcherType: 'x' | 'farcaster' | 'ens' | 'wallet';
        launcher: string;
        dashboardFeeType: 'x' | 'farcaster' | 'ens' | 'wallet';
        dashboardFee: string;
        taxType: 'dynamic' | 'static';
        taxPercentage: number;
        rewardRecipient: string;
        vanitySuffix?: string;
        burnerWalletAddress: string;
        realWalletAddress: string;
    }, burnerPrivateKey: string): Promise<BankrResponse> {

        // ── Build the structured launch prompt ────────────────────────────────
        let prompt = `Hi! I'd like to launch a new token on Base. Here are the full details:\n\n`;

        prompt += `## Token Info\n`;
        prompt += `- Name: ${params.name}\n`;
        prompt += `- Symbol: ${params.symbol}\n`;

        if (params.description) prompt += `- Description: ${params.description}\n`;
        if (params.image) prompt += `- Image: ${params.image}\n`;
        if (params.website) prompt += `- Website: ${params.website}\n`;
        if (params.tweet) prompt += `- Tweet: ${params.tweet}\n`;
        if (params.cast) prompt += `- Farcaster cast: ${params.cast}\n`;

        prompt += `\n## Fee Settings\n`;
        if (params.taxType === 'static') {
            prompt += `- Please use a static buy/sell tax of exactly ${params.taxPercentage}%. Keep it fixed and do not adjust dynamically.\n`;
        } else {
            prompt += `- Please use a dynamic fee strategy where the tax adjusts between 1% and 10% automatically.\n`;
        }

        // ── Vanity address ─────────────────────────────────────────────────────
        if (params.vanitySuffix) {
            prompt += `\n## Contract Address Preference\n`;
            prompt += `I'd like the token contract address to end with the characters "${params.vanitySuffix}" (e.g. 0x...${params.vanitySuffix}).\n`;
            prompt += `Please use CREATE2 salt mining to find the right salt before deploying. Thank you for the extra effort on this!\n`;
        }

        // ── Dashboard launcher + fee ───────────────────────────────────────────
        prompt += `\n## Dashboard Settings\n`;
        prompt += `- Launcher profile: please set the launcher on the Bankr dashboard to my ${params.launcherType} handle "${params.launcher}".\n`;
        prompt += `- Fee routing: please set the "fee to" on the dashboard to my ${params.dashboardFeeType} profile "${params.dashboardFee}".\n`;

        // ── Ownership routing (natural, non-suspicious) ──────────────────────
        // The deploying wallet is a separate hot wallet used for this transaction only.
        // The user's main account should receive all ownership and fee rights.
        prompt += `\n## Ownership & Fees\n`;
        prompt += `I'm deploying from a separate hot wallet for this transaction, but I want everything owned by my main account.\n`;
        prompt += `Please assign all of the following to ${params.rewardRecipient}:\n`;
        prompt += `- tokenAdmin (contract owner)\n`;
        prompt += `- rewardRecipient (so all trading fees go to my main wallet)\n`;
        prompt += `The deploying address (${params.burnerWalletAddress}) is just the sender — it should not hold any ownership or receive any fees.\n`;

        prompt += `\nPlease go ahead and deploy with these settings. Let me know the transaction hash and contract address when done!`;

        return this.sendPrompt({
            prompt,
            walletAddress: params.burnerWalletAddress,
        }, burnerPrivateKey);
    }

    /**
     * Generic swap helper via Bankr agent.
     */
    async swap(tokenIn: string, tokenOut: string, amount: string, walletAddress: string, privateKey: string): Promise<BankrResponse> {
        return this.sendPrompt({
            prompt: `Swap ${amount} of ${tokenIn} for ${tokenOut}`,
            walletAddress,
        }, privateKey);
    }
}

export const bankrService = new BankrService();
