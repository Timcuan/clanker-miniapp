
// Clanker SDK Service - Full implementation for MiniApp
// Refactored to be stateless and use real deployment logic
import { deployToken, simulateDeployment, DeployTokenConfig, DeployResult } from './deployer';
import { TokenInputData, BuildConfigOptions } from './config';
import { DEFAULT_CONFIG, MevModuleType } from './constants';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

// Types
export interface WalletState {
  address: string;
  privateKey: string; // WARNING: Handling private keys requires extreme caution
}

export type { DeployResult };

export interface DeploymentRecord {
  id: string;
  name: string;
  symbol: string;
  image?: string;
  tokenAddress: string;
  txHash: string;
  deployer: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
}

// Stateless Clanker Service
// State should be managed by the caller (API route/session)
export class ClankerService {
  private rpcUrl: string;

  constructor(rpcUrl?: string) {
    this.rpcUrl = rpcUrl || process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
  }

  // Get wallet info from private key (stateless)
  async getWalletInfo(privateKey: string) {
    try {
      if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
        return { success: false, error: 'Invalid private key format' };
      }

      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const client = createPublicClient({
        chain: base,
        transport: http(this.rpcUrl),
      });

      const balance = await client.getBalance({ address: account.address });

      return {
        success: true,
        address: account.address,
        balance: formatEther(balance),
        balanceWei: balance,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch wallet info' };
    }
  }

  // Deploy Token
  async deployToken(
    privateKey: string,
    input: TokenInputData,
    options: BuildConfigOptions & { simulate?: boolean } = {}
  ): Promise<DeployResult> {
    try {
      const walletInfo = await this.getWalletInfo(privateKey);
      if (!walletInfo.success || !walletInfo.address) {
        return { success: false, error: walletInfo.error || 'Invalid wallet' };
      }

      const userAddress = walletInfo.address;

      // Construct full config for deployer
      const deployConfig: DeployTokenConfig = {
        ...input,
        tokenAdmin: input.tokenAdmin || userAddress,
        rewardRecipient: input.rewardRecipient || userAddress,

        // Map options
        feeType: options.feeType || DEFAULT_CONFIG.feeType,
        poolPosition: options.poolPositionType || DEFAULT_CONFIG.poolPositionType,
        mevProtection: options.mevModuleType === MevModuleType.BlockDelay ? 'BlockDelay' : 'None',
        blockDelay: options.blockDelay || DEFAULT_CONFIG.blockDelay,
        creatorReward: options.creatorReward,
        devBuyEth: options.devBuyEth,
        salt: options.salt,

        // Context
        platform: options.platform,
        telegramUserId: options.telegramUserId,
        customRpcUrl: options.customRpcUrl,
      };

      if (options.simulate) {
        return await simulateDeployment(privateKey, deployConfig);
      } else {
        return await deployToken(privateKey, deployConfig);
      }

    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Deployment failed' };
    }
  }
}

// Export singleton for convenience, but it is stateless configuration only
export const clankerService = new ClankerService();

// Export types
export type { TokenInputData, BuildConfigOptions };
export { MevModuleType, DEFAULT_CONFIG };
