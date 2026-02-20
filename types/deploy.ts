// Deploy types

export type DeployMode = 'quick' | 'multi' | 'template';

export type DeployStatus = 'idle' | 'preparing' | 'signing' | 'pending' | 'success' | 'error';

export interface DeployResult {
  index: number;
  name: string;
  symbol: string;
  tokenAddress?: `0x${string}`;
  txHash?: `0x${string}`;
  gasUsed?: string;
  status: 'success' | 'failed';
  error?: string;
  deployedAt?: string;
}

export interface DeployProgress {
  current: number;
  total: number;
  status: DeployStatus;
  message: string;
  results: DeployResult[];
}

export interface DeployLinks {
  basescan: string;
  clanker: string;
  defined: string;
  gmgn: string;
}

export function getDeployLinks(
  tokenAddress: string,
  creatorAddress: string
): DeployLinks {
  return {
    basescan: `https://basescan.org/token/${tokenAddress}`,
    clanker: `https://clanker.world/clanker/${tokenAddress}`,
    defined: `https://www.defined.fi/tokens/discover?creatorAddress=${creatorAddress}`,
    gmgn: `https://gmgn.ai/base/token/${creatorAddress}`,
  };
}

export interface DeployFormData {
  version: string;
  createdAt: string;
  defaultAdmin: string;
  defaultReward: string;
  tokens: {
    name: string;
    symbol: string;
    image: string;
    tokenAdmin: string;
    rewardRecipient: string;
  }[];
}
