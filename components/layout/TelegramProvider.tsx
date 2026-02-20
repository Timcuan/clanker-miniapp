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

        // Handle Deep Linking / Routing from start_param
        const initDataUnsafe = app.initDataUnsafe as any;
        if (initDataUnsafe?.start_param) {
          const param = initDataUnsafe.start_param;
          console.log('Deep link detected:', param);

          if (param === 'deploy') window.location.href = '/deploy';
          if (param === 'history') window.location.href = '/history';
          if (param === 'settings') window.location.href = '/settings';
          // Using window.location.hash for HashRouter compatibility, 
          // or router.push if we pass router here. 
          // Since it's a provider, we'll try a more direct approach or just let the app handle it via useTelegramContext.
        }
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
