'use client';

import { useEffect, useState, useCallback } from 'react';
import type { TelegramWebApp, TelegramUser } from '@/types/telegram';
import {
  getWebApp,
  getTelegramUser,
  initWebApp,
  isTelegramWebApp,
  hapticFeedback,
  showMainButton,
  hideMainButton,
  setMainButtonLoading,
  showBackButton,
  hideBackButton,
} from '@/lib/telegram/webapp';

export function useTelegram() {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isTelegram, setIsTelegram] = useState(false);

  useEffect(() => {
    // Initialize on client side only
    if (typeof window !== 'undefined') {
      const app = getWebApp();
      const telegramUser = getTelegramUser();
      
      setWebApp(app);
      setUser(telegramUser);
      setIsTelegram(isTelegramWebApp());
      
      if (app) {
        initWebApp();
        setIsReady(true);
      } else {
        // Not in Telegram, still mark as ready for web fallback
        setIsReady(true);
      }
    }
  }, []);

  const colorScheme = webApp?.colorScheme || 'dark';

  const mainButton = useCallback((text: string, onClick: () => void) => {
    showMainButton(text, onClick);
    return () => hideMainButton();
  }, []);

  const backButton = useCallback((onClick: () => void) => {
    showBackButton(onClick);
    return () => hideBackButton();
  }, []);

  return {
    webApp,
    user,
    isReady,
    isTelegram,
    colorScheme,
    hapticFeedback,
    mainButton,
    backButton,
    setMainButtonLoading,
  };
}
