
import { POOL_POSITIONS, FEE_CONFIGS, MevModuleType, DEFAULT_CONFIG, INTERFACE_ADMIN, INTERFACE_REWARD_RECIPIENT } from './constants';
import { generateMessageId, normalizeIpfsUri } from '../utils';

export interface SocialMediaUrl {
  platform: string;
  url: string;
}

export interface TokenInputData {
  name: string;
  symbol: string;
  image: string;
  tokenAdmin: string;
  rewardRecipient: string;
  description?: string;
  socialMediaUrls?: SocialMediaUrl[];
}

export interface BuildConfigOptions {
  feeType?: 'dynamic' | 'static' | 'degen' | 'low';
  poolPositionType?: 'Standard' | 'Project';
  mevModuleType?: MevModuleType;
  blockDelay?: number;
  // Reward configuration
  creatorReward?: number; // 0-100 (percentage)
  // Context overrides
  platform?: 'telegram' | 'web' | string;
  telegramUserId?: number;
  // Dev buy
  devBuyEth?: number;
  // Vanity salt
  salt?: `0x${string}`;
  // Custom static fee
  staticFeePercentage?: number;
  // Custom RPC configuration
  customRpcUrl?: string;
}

// Get platform-specific context
function getPlatformContext(options: BuildConfigOptions, tokenAdmin: string) {
  const baseContext = {
    interface: DEFAULT_CONFIG.contextInterface,
    messageId: generateMessageId(),
  };

  // Support for Telegram User ID
  if (options.telegramUserId || options.platform === 'telegram') {
    return {
      ...baseContext,
      platform: 'telegram-miniapp',
      id: options.telegramUserId?.toString() || 'unknown',
    };
  }

  // Generic fallback for web or other platforms
  return {
    ...baseContext,
    platform: options.platform || 'web',
    id: tokenAdmin,
  };
}

export function buildTokenConfig(
  input: TokenInputData,
  options: BuildConfigOptions = {}
) {
  const {
    feeType = DEFAULT_CONFIG.feeType,
    poolPositionType = DEFAULT_CONFIG.poolPositionType,
    mevModuleType = DEFAULT_CONFIG.mevModuleType,
    blockDelay = DEFAULT_CONFIG.blockDelay,
    creatorReward = 100,
    devBuyEth = 0,
  } = options;

  const tokenAdmin = input.tokenAdmin as `0x${string}`;
  const rewardRecipient = input.rewardRecipient as `0x${string}`;

  // Calculate reward BPS (basis points)
  // Default: 0% to creator (tokenAdmin), 100% to interface (rewardRecipient)
  // Note: creatorReward is passed as %, so we verify bounds
  const safeCreatorReward = Math.min(Math.max(creatorReward, 0), 100);
  const creatorBps = safeCreatorReward * 100;
  const interfaceBps = 10000 - creatorBps;

  // Build metadata
  const metadata: { description?: string; socialMediaUrls?: SocialMediaUrl[] } = {};
  metadata.description = input.description || `${input.name} - Deployed via ${DEFAULT_CONFIG.contextInterface}`;

  if (input.socialMediaUrls && input.socialMediaUrls.length > 0) {
    metadata.socialMediaUrls = input.socialMediaUrls;
  }

  // Map fee config
  let fees: any = FEE_CONFIGS.DynamicBasic;
  if (feeType === 'static') {
    // Override static fee with custom percentage if static
    const staticFeeBps = (options.staticFeePercentage || 10) * 100;
    fees = {
      ...FEE_CONFIGS.StaticFlatCustom,
      clankerFee: staticFeeBps,
      pairedFee: staticFeeBps
    };
  } else if (feeType === 'degen') {
    fees = FEE_CONFIGS.HighFeeDegen;
  } else if (feeType === 'low') {
    fees = FEE_CONFIGS.ExperimentalLow;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: any = {
    name: input.name,
    symbol: input.symbol,
    image: normalizeIpfsUri(input.image),
    tokenAdmin,
    chainId: 8453, // Base Mainnet

    metadata,

    context: getPlatformContext(options, tokenAdmin),

    pool: {
      pairedToken: 'WETH',
      positions: POOL_POSITIONS[poolPositionType],
    },

    rewards: {
      recipients: [
        {
          admin: tokenAdmin,
          recipient: rewardRecipient,
          bps: creatorBps,
          token: 'Both',
        },
        {
          admin: INTERFACE_ADMIN,
          recipient: INTERFACE_REWARD_RECIPIENT,
          bps: interfaceBps,
          token: 'Both',
        },
      ],
    },

    fees,

    mevModule: {
      type: mevModuleType,
      ...(mevModuleType === MevModuleType.BlockDelay && {
        blockDelay,
      }),
    },

    // Sniper fees configuration for MEV protection
    sniperFees: {
      startingFee: mevModuleType === MevModuleType.BlockDelay ? (feeType === 'degen' ? 199000 : 99000) : 30000,
      endingFee: feeType === 'degen' ? 150000 : 30000,
      secondsToDecay: mevModuleType === MevModuleType.BlockDelay ? blockDelay * 2 : 60,
    },
  };

  // Add dev buy if specified
  if (devBuyEth > 0) {
    config.devBuy = {
      ethAmount: devBuyEth,
    };
  }

  // Add custom salt if provided (Vanity)
  if (options.salt) {
    config.salt = options.salt;
  }

  return config;
}

export function validateTokenInput(input: Partial<TokenInputData>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!input.name?.trim()) {
    errors.push('Token name is required');
  }

  if (!input.symbol?.trim()) {
    errors.push('Token symbol is required');
  } else if (!/^[a-zA-Z0-9]+$/.test(input.symbol)) {
    errors.push('Symbol can only contain letters and numbers');
  }

  if (!input.image?.trim()) {
    errors.push('Token image is required');
  }

  if (!input.tokenAdmin || !/^0x[a-fA-F0-9]{40}$/.test(input.tokenAdmin)) {
    errors.push('Invalid token admin address');
  }

  if (!input.rewardRecipient || !/^0x[a-fA-F0-9]{40}$/.test(input.rewardRecipient)) {
    errors.push('Invalid reward recipient address');
  }

  return { valid: errors.length === 0, errors };
}
