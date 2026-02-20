// Clanker SDK constants - matching CLI version

export const POOL_POSITIONS = {
  Standard: [
    {
      tickLower: -230400,
      tickUpper: -120000,
      positionBps: 10_000,
    },
  ],
  Project: [
    { tickLower: -230400, tickUpper: -214000, positionBps: 1_000 },
    { tickLower: -214000, tickUpper: -155000, positionBps: 5_000 },
    { tickLower: -202000, tickUpper: -155000, positionBps: 1_500 },
    { tickLower: -155000, tickUpper: -120000, positionBps: 2_000 },
    { tickLower: -141000, tickUpper: -120000, positionBps: 500 },
  ],
} as const;

export const FEE_CONFIGS = {
  DynamicBasic: {
    type: 'dynamic' as const,
    startingSniperFee: 100, // 1%
    endingSniperFee: 1000, // 10%
    baseFee: 100, // 1%
    maxFee: 1000, // 10%
    clankerFee: 20, // 0.2%
    referenceTickFilterPeriod: 30,
    resetPeriod: 120,
    resetTickFilter: 200,
    feeControlNumerator: 500000000,
    decayFilterBps: 7500,
    decayDuration: 30,
  },
  StaticFlat10Percent: {
    type: 'static' as const,
    clankerFee: 1000, // 10%
    pairedFee: 1000, // 10%
  },
} as const;

export enum MevModuleType {
  None = 'None',
  BlockDelay = 'BlockDelay',
  SniperAuctionV2 = 'SniperAuctionV2',
}

export const DEFAULT_CONFIG = {
  // MEV Protection
  mevModuleType: MevModuleType.BlockDelay,
  blockDelay: 8,

  // Fees
  feeType: 'dynamic' as const,

  // Pool
  pairedToken: 'WETH' as const,
  poolPositionType: 'Standard' as const,

  // Deploy
  maxTokensPerBatch: 100,
  deployDelaySeconds: 10,

  // Context
  contextInterface: 'Clanker MiniApp',
  contextPlatform: 'telegram-miniapp',

  // Default image
  defaultImage: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',

  // Defaults for Rewards
  defaultCreatorReward: 100, // 100% to recipient

  // Vanity
  vanityPrefix: 'B07',
} as const;

// Contract addresses
export const CLANKER_CONTRACTS = {
  v4: {
    factory: '0x0000000000000000000000000000000000000000' as `0x${string}`, // TODO: Update with real factory address
    feeLocker: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  },
} as const;

// Interface admin address for Clanker verification
export const INTERFACE_ADMIN = '0x1eaf444ebDf6495C57aD52A04C61521bBf564ace' as `0x${string}`;
export const INTERFACE_REWARD_RECIPIENT = '0x1eaf444ebDf6495C57aD52A04C61521bBf564ace' as `0x${string}`;

