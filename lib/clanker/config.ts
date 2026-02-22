
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
  vanity?: boolean;

  // V4 Advanced Features
  vault?: {
    percentage: number;
    lockupDuration: number;
    vestingDuration: number;
    recipient?: string;
  };
  airdrop?: {
    amount: number;
    merkleRoot: string;
    lockupDuration: number;
    vestingDuration: number;
    admin?: string;
  };
  presale?: {
    bps: number;
  };
  poolExtension?: {
    address: string;
    initData: string;
  };
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
  // Creator Reward % goes to Reward Recipient.
  // TokenAdmin gets 0% (used solely as the display admin on Clanker interface).
  const safeCreatorReward = Math.min(Math.max(creatorReward, 0), 100);
  const creatorBps = safeCreatorReward * 100;
  const interfaceBps = 10000 - creatorBps;

  // Build metadata (strip empty strings failsafe)
  const metadata: { description?: string; socialMediaUrls?: SocialMediaUrl[] } = {};

  const cleanDescription = input.description?.trim();
  metadata.description = cleanDescription || `${input.name} - Deployed via ${DEFAULT_CONFIG.contextInterface}`;

  if (input.socialMediaUrls && input.socialMediaUrls.length > 0) {
    const validUrls = input.socialMediaUrls.filter(s => s.platform?.trim() && s.url?.trim());
    if (validUrls.length > 0) {
      metadata.socialMediaUrls = validUrls;
    }
  }

  // Map fee config
  let fees: any = FEE_CONFIGS.DynamicBasic;
  if (feeType === 'static') {
    // Override static fee with custom percentage if static
    const staticFeeBps = Math.min((options.staticFeePercentage || 10) * 100, 500); // 500 bps is V4 max limit
    fees = {
      ...FEE_CONFIGS.StaticFlatCustom,
      clankerFee: staticFeeBps,
      pairedFee: staticFeeBps
    };
  } else if (feeType === 'degen') {
    fees = {
      ...FEE_CONFIGS.HighFeeDegen,
      maxFee: Math.min(FEE_CONFIGS.HighFeeDegen.maxFee, 500),
      startingSniperFee: Math.min(FEE_CONFIGS.HighFeeDegen.startingSniperFee, 500)
    };
  } else if (feeType === 'low') {
    fees = FEE_CONFIGS.ExperimentalLow;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: any = {
    name: input.name?.trim(),
    symbol: input.symbol?.trim(),
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
          recipient: tokenAdmin, // Display admin on Clanker interface
          bps: 0,
          token: 'Both',
        },
        {
          admin: tokenAdmin,
          recipient: rewardRecipient, // Actual Creator Reward Receiver
          bps: creatorBps,
          token: 'Both',
        },
        {
          admin: tokenAdmin,
          recipient: INTERFACE_REWARD_RECIPIENT || rewardRecipient, // Interface Fee Receiver
          bps: interfaceBps,
          token: 'Both',
        },
      ].filter(r => r.bps > 0),
    },

    fees,

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
  } else if (options.vanity !== undefined) {
    config.vanity = options.vanity;
  }

  // Advanced V4 Features
  if (options.vault) {
    const vaultRecipient = options.vault.recipient?.trim();
    config.vault = {
      percentage: options.vault.percentage,
      lockupDuration: options.vault.lockupDuration,
      vestingDuration: options.vault.vestingDuration,
      ...(vaultRecipient ? { recipient: vaultRecipient as `0x${string}` } : {})
    };
  }

  if (options.airdrop) {
    const merkleRoot = options.airdrop.merkleRoot?.trim();
    const airdropAdmin = options.airdrop.admin?.trim();

    // Fallback required merkle root to a valid 32-byte zero-hash if not provided but airdrop is enabled
    // Note: If amount > 0, merkleRoot is strictly required
    const safeMerkleRoot = merkleRoot || '0x0000000000000000000000000000000000000000000000000000000000000000';

    config.airdrop = {
      amount: options.airdrop.amount,
      merkleRoot: safeMerkleRoot as `0x${string}`,
      lockupDuration: options.airdrop.lockupDuration,
      vestingDuration: options.airdrop.vestingDuration,
      ...(airdropAdmin ? { admin: airdropAdmin as `0x${string}` } : {})
    };
  }

  if (options.presale) {
    config.presale = { bps: options.presale.bps };
  }

  if (options.poolExtension) {
    const extAddr = options.poolExtension.address?.trim();
    const extInit = options.poolExtension.initData?.trim();
    if (extAddr) {
      config.poolExtension = {
        address: extAddr as `0x${string}`,
        initData: (extInit || '0x') as `0x${string}`
      };
    }
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
