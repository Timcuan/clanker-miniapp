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
    let retryCount = 0;
    const MAX_RETRIES = 50; // 5 seconds total - increased for slow SDK loading

    const initTelegram = () => {
      if (typeof window === 'undefined') return;

      const app = window.Telegram?.WebApp;

      // Check if SDK is available and has user data (if expected)
      if (app && app.initData) {
        console.log('[TelegramProvider] SDK Ready');
        app.ready();
        app.expand();

        const user = app.initDataUnsafe?.user || null;
        const isTg = !!app.initData;

        setState({
          webApp: app,
          user,
          isReady: true,
          isTelegram: isTg,
          colorScheme: app.colorScheme || 'dark',
        });
        console.log('[TelegramProvider] State set. isTelegram:', isTg, 'user:', !!user);

        // Handle Deep Linking
        const startParam = app.initDataUnsafe?.start_param;
        if (startParam) {
          console.log('[TelegramProvider] Start Param:', startParam);
          // Handle routing if needed
        }
      } else if (retryCount < MAX_RETRIES) {
        retryCount++;
        setTimeout(initTelegram, 100);
      } else {
        console.warn('[TelegramProvider] SDK initialization timed out');
        setState(prev => ({ ...prev, isReady: true })); // Proceed as guest
      }
    };

    initTelegram();
  }, []);

  return (
    <TelegramContext.Provider value={state}>
      {children}
    </TelegramContext.Provider>
  );
}
