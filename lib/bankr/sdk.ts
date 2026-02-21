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
    error?: string;
}

export class BankrService {
    private apiUrl: string = 'https://api.bankr.bot/v2';

    constructor(private apiKey?: string) { }

    /**
   * Sends a prompt to the Bankr AI agent.
   * Internally handles the x402 payment challenge.
   */
    async sendPrompt(config: BankrPromptConfig, privateKey: string): Promise<BankrResponse> {
        try {
            console.log(`[Bankr] Sending prompt: "${config.prompt}" for wallet ${config.walletAddress}`);

            const endpoint = `${this.apiUrl}/prompt`;

            const payload = {
                walletAddress: config.walletAddress,
                prompt: config.prompt
            };

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`;
            }

            // Execute request with automatic x402 payment handling
            const result: X402Response = await fetchWithX402(
                endpoint,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                },
                privateKey,
                config.customRpcUrl
            );

            if (!result.success) {
                return {
                    success: false,
                    error: result.error || "Bankr request failed during x402 negotiation",
                };
            }

            return {
                success: true,
                message: "Bankr query executed successfully.",
                txData: result.data,
                // Include the payment txHash if one was made
                error: result.txHash ? `Payment Tx: ${result.txHash}` : undefined
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Bankr request failed unexpectedly",
            };
        }
    }

    /**
     * Helper to execute swaps via Bankr recommended routes.
     */
    async swap(tokenIn: string, tokenOut: string, amount: string, walletAddress: string, privateKey: string): Promise<BankrResponse> {
        const prompt = `Swap ${amount} of ${tokenIn} for ${tokenOut}`;
        return this.sendPrompt({ prompt, walletAddress }, privateKey);
    }

    async getAccount(privateKey: string) {
        return fetchWithX402('/account', { method: 'GET' }, privateKey);
    }

    /**
     * Executes a token launch using the Bankr Agent mimicking the @bankr/cli 'launch' command.
     */
    async launchToken(params: {
        name: string;
        image?: string;
        tweet?: string;
        feeType: 'x' | 'farcaster' | 'ens' | 'wallet';
        fee: string;
        walletAddress: string;
    }, privateKey: string) {

        let launchInstruction = `Please launch a new token on Base using your deployment factory with the following parameters:\n- Name: ${params.name}\n`;

        if (params.image) {
            launchInstruction += `- Image URL: ${params.image}\n`;
        }
        if (params.tweet) {
            launchInstruction += `- Announcement Tweet: ${params.tweet}\n`;
        }

        launchInstruction += `- Fee Recipient Type: ${params.feeType} platform\n`;
        launchInstruction += `- Fee Recipient Identifier: ${params.fee}\n\n`;
        launchInstruction += `My wallet address is ${params.walletAddress}. Please execute the deployment and return the transaction details.`;

        return this.sendPrompt({
            prompt: launchInstruction,
            walletAddress: params.walletAddress,
        }, privateKey);
    }
}

export const bankrService = new BankrService();
