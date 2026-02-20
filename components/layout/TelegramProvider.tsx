'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { TelegramWebApp, TelegramUser } from '@/types/telegram';
import { getWebApp, getTelegramUser, initWebApp, isTelegramWebApp } from '@/lib/telegram/webapp';

interface TelegramContextType {
  webApp: TelegramWebApp | null;
  user: TelegramUser | null;
  isReady: boolean;
  isTelegram: boolean;
  colorScheme: 'light' | 'dark';
}

const TelegramContext = createContext<TelegramContextType>({
  webApp: null,
  user: null,
  isReady: false,
  isTelegram: false,
  colorScheme: 'dark',
});

export function useTelegramContext() {
  return useContext(TelegramContext);
}

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TelegramContextType>({
    webApp: null,
    user: null,
    isReady: false,
    isTelegram: false,
    colorScheme: 'dark',
  });

  useEffect(() => {
    // Wait for Telegram WebApp script to load
    const initTelegram = () => {
      const app = getWebApp();
      const user = getTelegramUser();
      const isTg = isTelegramWebApp();

      if (app) {
        initWebApp();
      }

      setState({
        webApp: app,
        user,
        isReady: true,
        isTelegram: isTg,
        colorScheme: app?.colorScheme || 'dark',
      });
    };

    // Check if already loaded
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      initTelegram();
    } else {
      // Wait for script to load
      const timeout = setTimeout(initTelegram, 100);
      return () => clearTimeout(timeout);
    }
  }, []);

  return (
    <TelegramContext.Provider value={state}>
      {children}
    </TelegramContext.Provider>
  );
}
