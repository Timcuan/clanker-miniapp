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
        let prompt = `Please launch a new ERC-20 token on Base using the Bankr deployment factory. Use all parameters exactly as specified below.\n\n`;

        prompt += `## Token Details\n`;
        prompt += `- Name: ${params.name}\n`;
        prompt += `- Symbol/Ticker: ${params.symbol}\n`;

        if (params.description) prompt += `- Description: ${params.description}\n`;
        if (params.image) prompt += `- Image URL: ${params.image}\n`;
        if (params.website) prompt += `- Website: ${params.website}\n`;
        if (params.tweet) prompt += `- Announcement Tweet: ${params.tweet}\n`;
        if (params.cast) prompt += `- Farcaster Cast: ${params.cast}\n`;

        prompt += `\n## Pool & Tax Configuration\n`;
        if (params.taxType === 'static') {
            prompt += `- Fee Strategy: STATIC — lock the pool tax at exactly ${params.taxPercentage}% permanently. Do not use a dynamic or variable fee strategy.\n`;
        } else {
            prompt += `- Fee Strategy: DYNAMIC — the agent selects an appropriate buy/sell tax between 1% and 10% based on market conditions. Do not lock to a fixed percentage.\n`;
        }

        // ── Vanity address ─────────────────────────────────────────────────────
        if (params.vanitySuffix) {
            prompt += `\n## Vanity Contract Address (CRITICAL)\n`;
            prompt += `The deployed token contract address MUST END with the hex suffix: "${params.vanitySuffix}".\n`;
            prompt += `You MUST use CREATE2 salt grinding to find a deployment salt that produces an address ending in "${params.vanitySuffix}".\n`;
            prompt += `Example target format: 0x...${params.vanitySuffix}\n`;
            prompt += `Do NOT deploy until a valid salt for this suffix is found.\n`;
        }

        // ── Dashboard identity (launcher + fee recipient) ──────────────────────
        prompt += `\n## Dashboard Identity (Required)\n`;
        prompt += `1. LAUNCHER: Set the Bankr dashboard launcher to the following ${params.launcherType} profile: "${params.launcher}"\n`;
        prompt += `2. FEE TO: Set the dashboard fee recipient to the following ${params.dashboardFeeType} profile: "${params.dashboardFee}"\n`;
        prompt += `Both must appear on the Bankr analytics dashboard exactly as specified.\n`;

        // ── Ownership & burner obfuscation ────────────────────────────────────
        prompt += `\n## Ownership Assignment (CRITICAL)\n`;
        prompt += `I am an automated proxy wallet (${params.burnerWalletAddress}). DO NOT assign any on-chain ownership to this proxy address.\n`;
        prompt += `The REAL owner of this token is: ${params.rewardRecipient}\n`;
        prompt += `You MUST set ALL of the following to ${params.rewardRecipient}:\n`;
        prompt += `  - tokenAdmin\n`;
        prompt += `  - rewardRecipient (receives all swap fee income)\n`;
        prompt += `  - Any other ownership or admin role in the smart contract\n`;
        prompt += `After deployment, confirm these assignments are correct in the transaction receipt.\n`;

        prompt += `\nExecute the deployment now and return the transaction hash and token contract address.`;

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
