// Platform-specific configurations for multi-deploy

export interface PlatformConfig {
  name: string;
  clankerContext: {
    interface: string;
    platform: string;
    messageId: () => string;
    id: string;
  };
  features: {
    batchDeploy: boolean;
    maxTokensPerBatch: number;
    deployDelay: number;
    requireSignature: boolean;
  };
  ui: {
    theme: 'dark' | 'light';
    primaryColor: string;
    accentColor: string;
  };
  auth: {
    type: 'telegram' | 'farcaster' | 'wallet';
    requiredFields: string[];
  };
}

export const PLATFORM_CONFIGS: Record<'telegram' | 'farcaster' | 'web', PlatformConfig> = {
  telegram: {
    name: 'Telegram MiniApp',
    clankerContext: {
      interface: 'Clanker MiniApp',
      platform: 'telegram-miniapp',
      messageId: () => `tg-${Date.now()}`,
      id: 'telegram-user',
    },
    features: {
      batchDeploy: true,
      maxTokensPerBatch: 50, // Conservative limit for mobile
      deployDelay: 15, // Longer delay for mobile networks
      requireSignature: true,
    },
    ui: {
      theme: 'dark',
      primaryColor: '#0088cc',
      accentColor: '#00D4FF',
    },
    auth: {
      type: 'telegram',
      requiredFields: ['initData'],
    },
  },
  
  farcaster: {
    name: 'Farcaster MiniApp',
    clankerContext: {
      interface: 'Clanker MiniApp',
      platform: 'farcaster-miniapp',
      messageId: () => `fc-${Date.now()}`,
      id: 'farcaster-fid',
    },
    features: {
      batchDeploy: true,
      maxTokensPerBatch: 100, // Full limit for desktop
      deployDelay: 10, // Standard delay
      requireSignature: true,
    },
    ui: {
      theme: 'dark',
      primaryColor: '#8B5CF6',
      accentColor: '#A78BFA',
    },
    auth: {
      type: 'farcaster',
      requiredFields: ['fid', 'username'],
    },
  },
  
  web: {
    name: 'Clanker Web',
    clankerContext: {
      interface: 'Clanker Web',
      platform: 'web',
      messageId: () => `web-${Date.now()}`,
      id: 'web-user',
    },
    features: {
      batchDeploy: true,
      maxTokensPerBatch: 100,
      deployDelay: 5, // Faster for direct web access
      requireSignature: true,
    },
    ui: {
      theme: 'dark',
      primaryColor: '#059669',
      accentColor: '#10B981',
    },
    auth: {
      type: 'wallet',
      requiredFields: ['address'],
    },
  },
};

// Get platform configuration with environment overrides
export function getPlatformConfig(platform: 'telegram' | 'farcaster' | 'web'): PlatformConfig {
  const config = PLATFORM_CONFIGS[platform];
  
  // Apply environment variable overrides
  if (typeof window !== 'undefined') {
    const overrides = {
      maxTokensPerBatch: parseInt(process.env.NEXT_PUBLIC_MAX_TOKENS_PER_BATCH || config.features.maxTokensPerBatch.toString()),
      deployDelay: parseInt(process.env.NEXT_PUBLIC_DEPLOY_DELAY_SECONDS || config.features.deployDelay.toString()),
    };
    
    return {
      ...config,
      features: {
        ...config.features,
        ...overrides,
      },
    };
  }
  
  return config;
}

// Platform-specific validation rules
export const VALIDATION_RULES = {
  telegram: {
    tokenName: { min: 1, max: 30 }, // Shorter for mobile
    tokenSymbol: { min: 1, max: 5 },
    description: { max: 100 },
  },
  farcaster: {
    tokenName: { min: 1, max: 50 },
    tokenSymbol: { min: 1, max: 10 },
    description: { max: 200 },
  },
  web: {
    tokenName: { min: 1, max: 50 },
    tokenSymbol: { min: 1, max: 10 },
    description: { max: 500 },
  },
};
