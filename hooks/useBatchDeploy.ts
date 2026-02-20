import { useState, useCallback, useEffect } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { detectPlatform } from '@/lib/platform';
import { getPlatformConfig } from '@/config/platforms';
import { z } from 'zod';

const TokenSchema = z.object({
  name: z.string().min(1).max(50),
  symbol: z.string().min(1).max(10),
  description: z.string().optional(),
  image: z.string().url().optional(),
  tokenAdmin: z.string().optional(),
  rewardRecipient: z.string().optional(),
  pairedToken: z.string().default('WETH'),
  positionType: z.enum(['standard', 'project']).default('standard'),
  feeType: z.enum(['dynamic', 'static']).default('dynamic'),
  mevProtection: z.boolean().default(true),
});

export type TokenFormData = z.infer<typeof TokenSchema>;

export interface DeployResult {
  index: number;
  token: {
    name: string;
    symbol: string;
    address?: string;
  };
  status: 'pending' | 'success' | 'failed';
  links?: {
    basescan: string;
    clanker: string;
    defined: string;
    gmgn: string;
  };
  error?: string;
  txHash?: string;
}

export function useBatchDeploy() {
  const { 
    isAuthenticated, 
    formattedAddress
  } = useWallet();
  
  const [isDeploying, setIsDeploying] = useState(false);
  const [currentDeployIndex, setCurrentDeployIndex] = useState(-1);
  const [results, setResults] = useState<DeployResult[]>([]);
  const [platform, setPlatform] = useState<'telegram' | 'web'>('web');

  // Initialize platform on mount
  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);
  }, []);

  // Save results to localStorage
  const saveResults = useCallback((deployResults: DeployResult[]) => {
    if (typeof window !== 'undefined') {
      const history = JSON.parse(localStorage.getItem('clanker-deploy-history') || '[]');
      const newEntry = {
        id: Date.now(),
        platform,
        timestamp: new Date().toISOString(),
        walletAddress: formattedAddress,
        results: deployResults,
      };
      history.unshift(newEntry);
      // Keep only last 50 entries
      localStorage.setItem('clanker-deploy-history', JSON.stringify(history.slice(0, 50)));
    }
  }, [platform, formattedAddress]);


  // Deploy batch of tokens
  const deployBatch = useCallback(async (tokens: TokenFormData[]) => {
    if (!isAuthenticated) {
      throw new Error('Wallet not connected');
    }
    
    const config = getPlatformConfig(platform);
    
    // Validate batch size
    if (tokens.length > config.features.maxTokensPerBatch) {
      throw new Error(`Maximum ${config.features.maxTokensPerBatch} tokens per batch`);
    }
    
    // Validate all tokens
    const validatedTokens = tokens.map(t => TokenSchema.parse(t));
    
    setIsDeploying(true);
    setResults(validatedTokens.map((t, i) => ({
      index: i,
      token: { name: t.name, symbol: t.symbol },
      status: 'pending' as const,
    })));
    
    try {
      // Call batch deploy API
      const response = await fetch('/api/deploy/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add Telegram user ID header if on Telegram
          ...(platform === 'telegram' && {
            'x-telegram-user-id': localStorage.getItem('telegramUserId') || undefined,
          }),
        } as HeadersInit,
        credentials: 'include',
        body: JSON.stringify({
          tokens: validatedTokens,
          platform,
        }),
      });
      
      // Debug: Log the request data
      console.log('[BatchDeploy] Sending request:', { platform });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Batch deployment failed');
      }
      
      // Update results with server response
      setResults(data.results);
      
      // Save to localStorage
      saveResults(data.results);
      
      return {
        success: true,
        results: data.results,
        summary: data.summary,
      };
      
    } finally {
      setIsDeploying(false);
      setCurrentDeployIndex(-1);
    }
  }, [isAuthenticated, platform, saveResults]);

  // Get deployment history from localStorage
  const getHistory = useCallback(() => {
    if (typeof window !== 'undefined') {
      return JSON.parse(localStorage.getItem('clanker-deploy-history') || '[]');
    }
    return [];
  }, []);

  // Clear deployment history
  const clearHistory = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('clanker-deploy-history');
    }
  }, []);

  return {
    isDeploying,
    currentDeployIndex,
    results,
    platform,
    deployBatch,
    getHistory,
    clearHistory,
  };
}
