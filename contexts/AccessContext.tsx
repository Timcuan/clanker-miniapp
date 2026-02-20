'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { getTelegramUser } from '@/lib/telegram/webapp';

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
  validateCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  checkAccess: () => Promise<void>;
  revokeAccess: () => Promise<void>;
  saveSession: (walletAddress: string) => Promise<void>;
  clearSession: () => Promise<void>;
}

const AccessContext = createContext<AccessContextType | null>(null);

// Helper to get Telegram user ID
function getTelegramUserId(): number | null {
  if (typeof window === 'undefined') return null;
  const user = getTelegramUser();
  return user?.id || null;
}

// Build headers with Telegram user ID
function buildHeaders(telegramUserId: number | null): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (telegramUserId) {
    headers['x-telegram-user-id'] = telegramUserId.toString();
  }
  return headers;
}

// Check if access control should be skipped (development mode)
function shouldSkipAccessCheck(): boolean {
  if (typeof window === 'undefined') return false;
  return process.env.NEXT_PUBLIC_SKIP_ACCESS_CHECK === 'true';
}

// Helper to get Telegram username
function getTelegramUsername(): string | null {
  if (typeof window === 'undefined') return null;
  const user = getTelegramUser();
  return user?.username || user?.first_name || null;
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
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
    if (initRef.current) return;
    initRef.current = true;
    
    const init = async () => {
      // Skip access check in development if configured
      if (shouldSkipAccessCheck()) {
        console.log('[AccessContext] Skipping access check (dev mode)');
        setHasAccess(true);
        setIsAdmin(true);
        setIsLoggedIn(true);
        setIsInitialized(true);
        return;
      }
      
      setIsChecking(true);
      try {
        const tgUserId = getTelegramUserId();
        const tgUsername = getTelegramUsername();
        setTelegramUserId(tgUserId);
        setTelegramUsername(tgUsername);
        
        console.log(`[AccessContext] Init for TG user: ${tgUserId}`);
        
        // Check session first (for returning users)
        if (tgUserId) {
          const sessionRes = await fetch(`/api/session?telegramUserId=${tgUserId}`);
          const sessionData = await sessionRes.json();
          
          if (sessionData.hasSession && sessionData.isLoggedIn) {
            console.log('[AccessContext] Found existing session');
            setHasAccess(sessionData.hasAccess);
            setIsAdmin(sessionData.isAdmin);
            setIsLoggedIn(true);
            setWalletAddress(sessionData.walletAddress);
            setIsChecking(false);
            setIsInitialized(true);
            return;
          }
        }
        
        // No session, check access
        const url = tgUserId ? `/api/access?telegramUserId=${tgUserId}` : '/api/access';
        const response = await fetch(url, {
          credentials: 'include',
          headers: tgUserId ? { 'x-telegram-user-id': tgUserId.toString() } : undefined,
        });
        const data = await response.json();
        
        setHasAccess(data.hasAccess === true);
        setIsAdmin(data.isAdmin === true);
        if (!data.hasAccess && data.error) {
          setError(data.error);
        }
      } catch (err) {
        console.error('Failed to check access:', err);
        setHasAccess(false);
        setError('Failed to verify access');
      } finally {
        setIsChecking(false);
        setIsInitialized(true);
      }
    };
    
    init();
  }, []);

  const checkAccess = useCallback(async () => {
    setIsChecking(true);
    try {
      const tgUserId = telegramUserId || getTelegramUserId();
      const url = tgUserId ? `/api/access?telegramUserId=${tgUserId}` : '/api/access';
      const response = await fetch(url, {
        credentials: 'include',
        headers: tgUserId ? { 'x-telegram-user-id': tgUserId.toString() } : undefined,
      });
      const data = await response.json();
      
      setHasAccess(data.hasAccess === true);
      setError(data.hasAccess ? null : data.error);
    } catch (err) {
      console.error('Failed to check access:', err);
      setHasAccess(false);
      setError('Failed to verify access');
    } finally {
      setIsChecking(false);
    }
  }, [telegramUserId]);

  const validateCode = useCallback(async (code: string): Promise<{ success: boolean; error?: string }> => {
    setIsChecking(true);
    setError(null);
    
    try {
      const tgUserId = telegramUserId || getTelegramUserId();
      const tgUsername = telegramUsername || getTelegramUsername();
      
      const response = await fetch('/api/access', {
        method: 'POST',
        headers: buildHeaders(tgUserId),
        body: JSON.stringify({ 
          code, 
          telegramUserId: tgUserId,
          telegramUsername: tgUsername,
        }),
        credentials: 'include',
      });
      
      const data = await response.json();
      
      if (data.success) {
        setHasAccess(true);
        setIsAdmin(data.isAdmin === true);
        setError(null);
        return { success: true };
      } else {
        setError(data.error || 'Invalid access code');
        return { success: false, error: data.error || 'Invalid access code' };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Network error';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsChecking(false);
    }
  }, [telegramUserId, telegramUsername]);

  const revokeAccess = useCallback(async () => {
    try {
      const tgUserId = telegramUserId || getTelegramUserId();
      await fetch('/api/access', {
        method: 'DELETE',
        credentials: 'include',
        headers: tgUserId ? { 'x-telegram-user-id': tgUserId.toString() } : undefined,
      });
      setHasAccess(false);
      setError(null);
    } catch (err) {
      console.error('Failed to revoke access:', err);
    }
  }, [telegramUserId]);

  // Save session with wallet address
  const saveSession = useCallback(async (wallet: string) => {
    try {
      const tgUserId = telegramUserId || getTelegramUserId();
      const tgUsername = telegramUsername || getTelegramUsername();
      
      if (!tgUserId) {
        console.log('[Session] No Telegram user ID, skipping session save');
        return;
      }
      
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramUserId: tgUserId,
          telegramUsername: tgUsername,
          walletAddress: wallet,
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        setWalletAddress(wallet);
        setIsLoggedIn(true);
        console.log('[Session] Saved successfully');
      }
    } catch (err) {
      console.error('[Session] Failed to save:', err);
    }
  }, [telegramUserId, telegramUsername]);

  // Clear session (logout)
  const clearSession = useCallback(async () => {
    try {
      const tgUserId = telegramUserId || getTelegramUserId();
      if (tgUserId) {
        await fetch(`/api/session?telegramUserId=${tgUserId}`, {
          method: 'DELETE',
        });
      }
      setWalletAddress(null);
      setIsLoggedIn(false);
      console.log('[Session] Cleared');
    } catch (err) {
      console.error('[Session] Failed to clear:', err);
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
        validateCode,
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
