// Token types matching Clanker SDK

export interface TokenInput {
  name: string;
  symbol: string;
  image: string;
  tokenAdmin: string;
  rewardRecipient: string;
}

export interface TokenConfig {
  name: string;
  symbol: string;
  image: string;
  tokenAdmin: `0x${string}`;
  pool: {
    pairedToken: 'WETH' | `0x${string}`;
    positions: PoolPosition[];
  };
  context: TokenContext;
  rewards: {
    recipients: RewardRecipient[];
  };
  fees: FeeConfig;
  mevModule: MevModuleConfig;
}

export interface PoolPosition {
  tickLower: number;
  tickUpper: number;
  positionBps: number;
}

export interface TokenContext {
  interface: string;
  platform: string;
  messageId: string;
  id: string;
}

export interface RewardRecipient {
  admin: `0x${string}`;
  recipient: `0x${string}`;
  bps: number;
  token: 'Both' | 'Clanker' | 'Paired';
}

export type FeeType = 'dynamic' | 'static';

export interface DynamicFeeConfig {
  type: 'dynamic';
  startingSniperFee: number;
  endingSniperFee: number;
  baseFee: number;
  maxFee: number;
  clankerFee: number;
  referenceTickFilterPeriod: number;
  resetPeriod: number;
  resetTickFilter: number;
  feeControlNumerator: number;
  decayFilterBps: number;
  decayDuration: number;
}

export interface StaticFeeConfig {
  type: 'static';
  clankerFee: number;
  pairedFee: number;
}

export type FeeConfig = DynamicFeeConfig | StaticFeeConfig;

export type MevModuleType = 'None' | 'BlockDelay' | 'SniperAuctionV2';

export interface MevModuleConfig {
  type: MevModuleType;
  blockDelay?: number;
}

// Pool position presets
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

// Fee config presets
export const FEE_CONFIGS = {
  DynamicBasic: {
    type: 'dynamic' as const,
    startingSniperFee: 100,
    endingSniperFee: 500,
    baseFee: 100,
    maxFee: 500,
    clankerFee: 20,
    referenceTickFilterPeriod: 30,
    resetPeriod: 120,
    resetTickFilter: 200,
    feeControlNumerator: 500000000,
    decayFilterBps: 7500,
    decayDuration: 30,
  },
  StaticFlat5Percent: {
    type: 'static' as const,
    clankerFee: 500,
    pairedFee: 500,
  },
} as const;
