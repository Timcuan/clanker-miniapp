'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useTelegramContext } from '@/components/layout/TelegramProvider';
import { useWallet } from '@/contexts/WalletContext';

interface AccessContextType {
  hasAccess: boolean;
  isAdmin: boolean;
  isChecking: boolean;
  isInitialized: boolean;
  isLoggedIn: boolean;
  error: string | null;
  telegramUserId: number | null;
  telegramUsername: string | null;
  walletAddress: string | null;

  // Methods
  checkAccess: () => Promise<void>;
  revokeAccess: () => Promise<void>;
  saveSession: (walletAddress: string) => Promise<void>;
  clearSession: () => Promise<void>;
}

const AccessContext = createContext<AccessContextType | null>(null);

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const { user, isReady } = useTelegramContext();
  const { isAuthenticated, address: walletAddressFromContext } = useWallet();
  const [hasAccess, setHasAccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telegramUserId, setTelegramUserId] = useState<number | null>(null);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const initRef = useRef(false);

  // Check access on mount
  useEffect(() => {
    if (!isReady || initRef.current) return;
    initRef.current = true;

    const runInit = async (retryCount = 0) => {
      setIsChecking(true);
      try {
        const tgUserId = user?.id || null;
        const tgUsername = user?.username || user?.first_name || null;
        setTelegramUserId(tgUserId);
        setTelegramUsername(tgUsername);

        const initData = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp?.initData : '';

        // 1. AUTO-LOGIN ATTEMPT
        if (initData && (tgUserId || retryCount > 0)) {
          try {
            await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ initData })
            });
          } catch (e) {
            console.error('[Access] Auto-login failed:', e);
          }
        }

        // 2. SESSION CHECK
        const url = tgUserId ? `/api/session?telegramUserId=${tgUserId}` : '/api/session';
        const response = await fetch(url, { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          if (data.isAdmin || data.hasAccess) {
            setHasAccess(data.hasAccess || false);
            setIsAdmin(data.isAdmin || false);
            setWalletAddress(data.walletAddress || null);
            setIsLoggedIn(data.isLoggedIn === true);
            setIsInitialized(true);
            setIsChecking(false);
            return; // Success!
          }
        }

        // 3. RETRY LOGIC (Wait for SDK synchronization)
        if (retryCount < 2 && initData) {
          console.log('[Access] Verification pending, retrying...', retryCount + 1);
          setTimeout(() => runInit(retryCount + 1), 800);
          return;
        }

        // 4. FINAL STATE (Unauthorized)
        setHasAccess(false);
        setIsAdmin(false);
        setWalletAddress(null);
        setIsLoggedIn(false);
      } catch (err) {
        console.error('[AccessStatus] Critical Init Error:', err);
        setError('Connection failed');
        // If it fails completely, we still need to clear checking state
        setIsChecking(false);
      } finally {
        setIsChecking(false);
        setIsInitialized(true);
      }
    };

    runInit();
  }, [isReady, user]);

  const checkAccess = useCallback(async () => {
    setIsChecking(true);
    try {
      const tgUserId = telegramUserId;
      const url = tgUserId ? `/api/session?telegramUserId=${tgUserId}` : '/api/session';
      const response = await fetch(url, { credentials: 'include' });
      const data = await response.json();

      setHasAccess(data.hasAccess === true);
      setIsAdmin(data.isAdmin === true);
      setIsLoggedIn(data.isLoggedIn === true);
      setWalletAddress(data.walletAddress || null);
    } catch (err) {
      console.error('[AccessStatus] Check error:', err);
    } finally {
      setIsChecking(false);
    }
  }, [telegramUserId]);

  // Sync with WalletContext
  useEffect(() => {
    let mounted = true;
    if (isAuthenticated && walletAddressFromContext) {
      if (mounted) {
        setWalletAddress(walletAddressFromContext);
        setIsLoggedIn(true);
        checkAccess();
      }
    } else if (!isAuthenticated && isInitialized) {
      // Only clear if initialized, prevents premature clearing
      if (mounted) {
        setIsLoggedIn(false);
        setWalletAddress(null);
      }
    }
    return () => { mounted = false; };
  }, [isAuthenticated, walletAddressFromContext, checkAccess, isInitialized]);

  const revokeAccess = useCallback(async () => {
    try {
      if (telegramUserId) {
        await fetch(`/api/access?telegramUserId=${telegramUserId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      }
      setHasAccess(false);
    } catch (err) {
      console.error('Failed to revoke access:', err);
    }
  }, [telegramUserId]);

  const saveSession = useCallback(async (wallet: string) => {
    try {
      if (!telegramUserId) return;

      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramUserId,
          telegramUsername,
          walletAddress: wallet,
        }),
      });

      if (response.ok) {
        setWalletAddress(wallet);
        setIsLoggedIn(true);
      }
    } catch (err) {
      console.error('[Session] Save error:', err);
    }
  }, [telegramUserId, telegramUsername]);

  const clearSession = useCallback(async () => {
    try {
      if (telegramUserId) {
        await fetch(`/api/session?telegramUserId=${telegramUserId}`, {
          method: 'DELETE',
        });
      }
      setWalletAddress(null);
      setIsLoggedIn(false);
    } catch (err) {
      console.error('[Session] Clear error:', err);
    }
  }, [telegramUserId]);

  return (
    <AccessContext.Provider
      value={{
        hasAccess,
        isAdmin,
        isChecking,
        isInitialized,
        isLoggedIn,
        error,
        telegramUserId,
        telegramUsername,
        walletAddress,
        checkAccess,
        revokeAccess,
        saveSession,
        clearSession,
      }}
    >
      {children}
    </AccessContext.Provider>
  );
}

export function useAccess() {
  const context = useContext(AccessContext);
  if (!context) {
    throw new Error('useAccess must be used within an AccessProvider');
  }
  return context;
}
