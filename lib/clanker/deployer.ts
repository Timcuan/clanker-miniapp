import { Clanker } from 'clanker-sdk/v4';
import { createPublicClient, createWalletClient, http, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { buildTokenConfig, type TokenInputData } from './config';
import { MevModuleType } from './constants';

// Telegram user interface
export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

// Interface for deploy configuration - simplified to use shared types
export interface DeployTokenConfig extends TokenInputData {
  // Config options matching config.ts
  feeType: 'dynamic' | 'static';
  poolPosition: 'Standard' | 'Project';
  mevProtection: 'None' | 'BlockDelay';
  blockDelay: number;
  devBuyEth?: number;
  creatorReward?: number; // 0-100%
  salt?: `0x${string}`;

  // Platform context
  platform?: 'telegram' | 'web' | string;
  telegramUser?: TelegramUser;
  telegramUserId?: number;
  messageId?: string;
}

export interface DeployResult {
  success: boolean;
  tokenAddress?: string;
  txHash?: string;
  error?: string;
}

/**
 * Helper to create Clanker instance
 */
function getClankerClient(privateKey: string) {
  if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
    throw new Error('Invalid private key format');
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  }) as PublicClient;

  const wallet = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl),
  });

  return new Clanker({
    wallet,
    publicClient,
  });
}

/**
 * Deploy a token using Clanker SDK v4
 */
export async function deployToken(
  privateKey: string,
  config: DeployTokenConfig
): Promise<DeployResult> {
  try {
    const clanker = getClankerClient(privateKey);

    // Map DeployTokenConfig to buildTokenConfig options
    const inputData: TokenInputData = {
      name: config.name,
      symbol: config.symbol,
      image: config.image,
      tokenAdmin: config.tokenAdmin,
      rewardRecipient: config.rewardRecipient,
      description: config.description,
      socialMediaUrls: config.socialMediaUrls,
    };

    const tokenConfig = buildTokenConfig(inputData, {
      feeType: config.feeType,
      poolPositionType: config.poolPosition,
      mevModuleType: config.mevProtection === 'BlockDelay' ? MevModuleType.BlockDelay : MevModuleType.None,
      blockDelay: config.blockDelay,
      creatorReward: config.creatorReward,
      devBuyEth: config.devBuyEth,
      salt: config.salt,
      platform: config.platform,
      telegramUserId: config.telegramUserId,
    });

    console.log('Deploying token with config:', {
      name: tokenConfig.name,
      symbol: tokenConfig.symbol,
      tokenAdmin: config.tokenAdmin,
      rewardRecipient: config.rewardRecipient,
    });

    // Deploy using SDK
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await clanker.deploy(tokenConfig as any);

    if (result.error) {
      return {
        success: false,
        error: result.error.message || 'Deployment failed',
      };
    }

    // Wait for confirmation
    if (result.txHash && result.waitForTransaction) {
      const txResult = await result.waitForTransaction();

      if (txResult.error) {
        return {
          success: false,
          error: txResult.error.message || 'Transaction failed',
        };
      }

      console.log('Token deployed:', txResult);

      return {
        success: true,
        tokenAddress: txResult.address,
        txHash: result.txHash,
      };
    }

    return {
      success: false,
      error: 'No transaction hash returned',
    };

  } catch (error) {
    console.error('Deployment error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Deployment failed',
    };
  }
}

/**
 * Simulate deployment
 */
export async function simulateDeployment(
  privateKey: string,
  config: DeployTokenConfig
): Promise<DeployResult> {
  try {
    const clanker = getClankerClient(privateKey);

    const inputData: TokenInputData = {
      name: config.name,
      symbol: config.symbol,
      image: config.image,
      tokenAdmin: config.tokenAdmin,
      rewardRecipient: config.rewardRecipient,
      description: config.description,
      socialMediaUrls: config.socialMediaUrls,
    };

    const tokenConfig = buildTokenConfig(inputData, {
      feeType: config.feeType,
      poolPositionType: config.poolPosition,
      mevModuleType: config.mevProtection === 'BlockDelay' ? MevModuleType.BlockDelay : MevModuleType.None,
      blockDelay: config.blockDelay,
      creatorReward: config.creatorReward,
      devBuyEth: 0,
      salt: config.salt,
      platform: config.platform,
      telegramUserId: config.telegramUserId,
    });

    // Simulate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const simulation = await clanker.deploySimulate(tokenConfig as any);

    console.log('Simulation result:', simulation);

    if (simulation.error) {
      return {
        success: false,
        error: simulation.error.message || 'Simulation failed',
      };
    }

    // SimulateContractReturnType check
    const simResult = simulation as { result?: `0x${string}` };
    if (simResult.result) {
      return {
        success: true,
        tokenAddress: simResult.result,
      };
    }

    return {
      success: true,
      tokenAddress: undefined,
    };

  } catch (error) {
    console.error('Simulation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Simulation failed',
    };
  }
}
