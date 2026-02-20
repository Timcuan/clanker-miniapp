'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

interface SessionInfo {
  expiresIn: number;
  expiresInFormatted: string;
}

interface WalletContextType {
  isAuthenticated: boolean;
  address: string | null;
  formattedAddress: string | null;
  balance: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  sessionInfo: SessionInfo | null;
  sessionExpired: boolean;
  telegramUserId: number | null;

  // New: Active wallet management
  activeWalletAddress: string | null;
  setActiveWallet: (address: string | null) => void;

  // Viem clients
  walletClient: string | null;
  publicClient: ReturnType<typeof createPublicClient>;

  // Methods
  connectWallet: (privateKey: string, initData?: string) => Promise<{ success: boolean; error?: string }>;
  generateWallet: (initData?: string) => Promise<{ success: boolean; address?: string; privateKey?: string; error?: string }>;
  disconnectWallet: () => Promise<void>;
  checkConnection: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  signMessage: (message: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextType | null>(null);

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Helper to get Telegram user ID
function getTelegramUserId(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.WebApp;
    return tg?.initDataUnsafe?.user?.id || null;
  } catch {
    return null;
  }
}

// Helper to get Telegram username
function getTelegramUsername(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    return user?.username || user?.first_name || null;
  } catch {
    return null;
  }
}

// Build API URL with Telegram user ID
function buildApiUrl(telegramUserId: number | null): string {
  if (telegramUserId) {
    return `/api/wallet?telegramUserId=${telegramUserId}`;
  }
  return '/api/wallet';
}

// Build headers with Telegram user ID
function buildHeaders(telegramUserId: number | null): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (telegramUserId) {
    headers['x-telegram-user-id'] = telegramUserId.toString();
  }
  return headers;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [telegramUserId, setTelegramUserId] = useState<number | null>(null);
  const [activeWalletAddress, setActiveWalletAddress] = useState<string | null>(null);
  const initRef = useRef(false);

  // Initialize viem clients
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
  });

  const [walletClient, setWalletClient] = useState<string | null>(null);

  // Check connection on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async (retries = 10) => {
      try {
        console.log(`[WalletContext] Initializing... (${retries} retries)`);
        let tgUserId = getTelegramUserId();

        if (!tgUserId && retries > 0) {
          console.log(`[WalletContext] Waiting for Telegram User ID... (${retries} retries left)`);
          setTimeout(() => init(retries - 1), 500);
          return;
        }

        setTelegramUserId(tgUserId);

        // 2. Initial Session Check
        const apiUrl = buildApiUrl(tgUserId);
        const response = await fetch(apiUrl, {
          credentials: 'include',
          headers: tgUserId ? { 'x-telegram-user-id': tgUserId.toString() } : undefined,
        });
        const data = await response.json();

        if (data.sessionExpired) {
          setSessionExpired(true);
          setAddress(null);
          setBalance(null);
          setSessionInfo(null);
        } else if (data.connected && data.address) {
          setAddress(data.address);
          setSessionExpired(false);
          if (data.balance) {
            setBalance(data.balance);
          }
          if (data.session) {
            setSessionInfo(data.session);
          }
        }

        // Load active wallet (try CloudStorage first, fallback to localStorage)
        let savedActive = null;
        try {
          // @ts-ignore
          const tg = window.Telegram?.WebApp;
          if (tg && tg.CloudStorage) {
            savedActive = await new Promise<string | null>((resolve) => {
              tg.CloudStorage.getItem('clanker_active_wallet', (err: any, value?: string) => {
                if (!err && value) resolve(value);
                else resolve(null);
              });
            });
          }
        } catch (e) {
          console.warn('Failed to read active wallet from CloudStorage', e);
        }

        if (!savedActive) {
          savedActive = localStorage.getItem('clanker_active_wallet');
        }

        if (savedActive) {
          setActiveWalletAddress(savedActive);
        }
      } catch (error) {
        console.error('Failed to check wallet connection:', error);
      } finally {
        setIsInitialized(true);
      }
    };

    init();
  }, []);

  const checkConnection = useCallback(async () => {
    try {
      const tgUserId = telegramUserId || getTelegramUserId();
      const apiUrl = buildApiUrl(tgUserId);
      const response = await fetch(apiUrl, {
        credentials: 'include',
        headers: tgUserId ? { 'x-telegram-user-id': tgUserId.toString() } : undefined,
      });
      const data = await response.json();

      if (data.sessionExpired) {
        setSessionExpired(true);
        setAddress(null);
        setBalance(null);
        setSessionInfo(null);
      } else if (data.connected && data.address) {
        setAddress(data.address);
        setSessionExpired(false);
        if (data.balance) {
          setBalance(data.balance);
        }
        if (data.session) {
          setSessionInfo(data.session);
        }
      } else {
        setAddress(null);
        setBalance(null);
        setSessionInfo(null);
      }
    } catch (error) {
      console.error('Failed to check wallet connection:', error);
      setAddress(null);
      setBalance(null);
      setSessionInfo(null);
    }
  }, [telegramUserId]);

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    try {
      const tgUserId = telegramUserId || getTelegramUserId();
      const apiUrl = buildApiUrl(tgUserId);
      const response = await fetch(apiUrl, {
        credentials: 'include',
        headers: tgUserId ? { 'x-telegram-user-id': tgUserId.toString() } : undefined,
      });
      const data = await response.json();
      if (data.balance) {
        setBalance(data.balance);
      }
      if (data.session) {
        setSessionInfo(data.session);
      }
    } catch (error) {
      console.error('Failed to refresh balance:', error);
    }
  }, [address, telegramUserId]);

  // Auto-refresh balance every 30 seconds when connected
  useEffect(() => {
    if (!address) return;

    const interval = setInterval(() => {
      refreshBalance();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [address, refreshBalance]);

  const connectWallet = useCallback(async (privateKey: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);

    try {
      const tgUserId = telegramUserId || getTelegramUserId();
      const tgUsername = getTelegramUsername();


      const response = await fetch('/api/wallet', {
        method: 'POST',
        headers: buildHeaders(tgUserId),
        body: JSON.stringify({
          privateKey,
          telegramUserId: tgUserId,
          telegramUsername: tgUsername,
        }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        setIsLoading(false);
        return { success: false, error: data.error || 'Failed to connect wallet' };
      }

      setAddress(data.address);
      setSessionExpired(false);

      // Note: Wallet client is managed server-side via session
      // Client-side operations use the session-based API
      setWalletClient(data.address); // Store address as reference

      // Fetch balance immediately after connect
      try {
        const apiUrl = buildApiUrl(tgUserId);
        const balanceResponse = await fetch(apiUrl, {
          credentials: 'include',
          headers: tgUserId ? { 'x-telegram-user-id': tgUserId.toString() } : undefined,
        });
        const balanceData = await balanceResponse.json();
        if (balanceData.balance) {
          setBalance(balanceData.balance);
        }
        if (balanceData.session) {
          setSessionInfo(balanceData.session);
        }
      } catch (e) {
        console.error('Failed to fetch balance after connect:', e);
      }

      setIsLoading(false);
      return { success: true };
    } catch (error) {
      setIsLoading(false);
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }, [telegramUserId]);

  const generateWallet = useCallback(async (initData?: string): Promise<{ success: boolean; address?: string; privateKey?: string; error?: string }> => {
    setIsLoading(true);
    try {
      const tgUserId = telegramUserId || getTelegramUserId();
      const tgUsername = getTelegramUsername();

      // Get initData if not provided
      let tgInitData = initData;
      if (!tgInitData && typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tgInitData = (window as any).Telegram?.WebApp?.initData;
      }

      const response = await fetch('/api/wallet', {
        method: 'PUT',
        headers: buildHeaders(tgUserId),
        body: JSON.stringify({
          telegramUserId: tgUserId,
          telegramUsername: tgUsername,
          initData: tgInitData,
        }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        setIsLoading(false);
        return { success: false, error: data.error || 'Failed to generate wallet' };
      }

      setAddress(data.address);
      setSessionExpired(false);
      setWalletClient(data.address);
      setBalance('0'); // New wallet has 0 balance

      setIsLoading(false);
      return {
        success: true,
        address: data.address,
        privateKey: data.privateKey
      };

    } catch (error) {
      setIsLoading(false);
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }, [telegramUserId]);

  const disconnectWallet = useCallback(async () => {
    try {
      const tgUserId = telegramUserId || getTelegramUserId();
      await fetch('/api/wallet', {
        method: 'DELETE',
        credentials: 'include',
        headers: tgUserId ? { 'x-telegram-user-id': tgUserId.toString() } : undefined,
      });
      setAddress(null);
      setBalance(null);
      setSessionInfo(null);
      setSessionExpired(false);
      setWalletClient(null);
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  }, [telegramUserId]);

  // Sign message method (server-side via session)
  const signMessage = useCallback(async (message: string): Promise<string> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    try {
      const tgUserId = telegramUserId || getTelegramUserId();
      const response = await fetch('/api/wallet/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tgUserId && { 'x-telegram-user-id': tgUserId.toString() }),
        },
        body: JSON.stringify({ message }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to sign message');
      }

      const data = await response.json();
      return data.signature;
    } catch (error) {
      console.error('Failed to sign message:', error);
      throw error;
    }
  }, [address, telegramUserId]);

  const isAuthenticated = address !== null;
  const formattedAddress = address ? formatAddress(address) : null;

  const setActiveWallet = useCallback((address: string | null) => {
    setActiveWalletAddress(address);
    if (address) {
      localStorage.setItem('clanker_active_wallet', address);
      try {
        // @ts-ignore
        const tg = window.Telegram?.WebApp;
        if (tg && tg.CloudStorage) {
          tg.CloudStorage.setItem('clanker_active_wallet', address);
        }
      } catch (e) { }
    } else {
      localStorage.removeItem('clanker_active_wallet');
      try {
        // @ts-ignore
        const tg = window.Telegram?.WebApp;
        if (tg && tg.CloudStorage) {
          tg.CloudStorage.removeItem('clanker_active_wallet');
        }
      } catch (e) { }
    }
  }, []);

  return (
    <WalletContext.Provider
      value={{
        isAuthenticated,
        address,
        formattedAddress,
        balance,
        isLoading,
        isInitialized,
        sessionInfo,
        sessionExpired,
        telegramUserId,
        activeWalletAddress,
        setActiveWallet,
        walletClient,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        publicClient: publicClient as any,
        connectWallet,
        disconnectWallet,
        checkConnection,
        refreshBalance,
        signMessage,
        generateWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
