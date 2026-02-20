'use client';

import type { TelegramWebApp, TelegramUser } from '@/types/telegram';

// Check if running in Telegram WebApp
export function isTelegramWebApp(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.Telegram?.WebApp?.initData;
}

// Get Telegram WebApp instance
export function getWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp || null;
}

// Get current user
export function getTelegramUser(): TelegramUser | null {
  const webApp = getWebApp();
  return webApp?.initDataUnsafe?.user || null;
}

// Initialize WebApp
export function initWebApp(): void {
  const webApp = getWebApp();
  if (webApp) {
    webApp.ready();
    webApp.expand();
  }
}

// Theme helpers
export function getColorScheme(): 'light' | 'dark' {
  const webApp = getWebApp();
  return webApp?.colorScheme || 'dark';
}

export function getThemeParams() {
  const webApp = getWebApp();
  return webApp?.themeParams || {};
}

// Main Button helpers
export function showMainButton(text: string, onClick: () => void): void {
  const webApp = getWebApp();
  if (webApp) {
    webApp.MainButton.setText(text);
    webApp.MainButton.onClick(onClick);
    webApp.MainButton.show();
  }
}

export function hideMainButton(): void {
  const webApp = getWebApp();
  if (webApp) {
    webApp.MainButton.hide();
  }
}

export function setMainButtonLoading(loading: boolean): void {
  const webApp = getWebApp();
  if (webApp) {
    if (loading) {
      webApp.MainButton.showProgress();
    } else {
      webApp.MainButton.hideProgress();
    }
  }
}

// Back Button helpers
export function showBackButton(onClick: () => void): void {
  const webApp = getWebApp();
  if (webApp) {
    webApp.BackButton.onClick(onClick);
    webApp.BackButton.show();
  }
}

export function hideBackButton(): void {
  const webApp = getWebApp();
  if (webApp) {
    webApp.BackButton.hide();
  }
}

// Haptic feedback
export function hapticFeedback(type: 'success' | 'error' | 'warning' | 'light' | 'medium' | 'heavy'): void {
  const webApp = getWebApp();
  if (webApp) {
    if (['success', 'error', 'warning'].includes(type)) {
      webApp.HapticFeedback.notificationOccurred(type as 'success' | 'error' | 'warning');
    } else {
      webApp.HapticFeedback.impactOccurred(type as 'light' | 'medium' | 'heavy');
    }
  }
}

// Alerts and popups
export function showAlert(message: string): Promise<void> {
  return new Promise((resolve) => {
    const webApp = getWebApp();
    if (webApp) {
      webApp.showAlert(message, resolve);
    } else {
      alert(message);
      resolve();
    }
  });
}

export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const webApp = getWebApp();
    if (webApp) {
      webApp.showConfirm(message, resolve);
    } else {
      resolve(confirm(message));
    }
  });
}

// Links
export function openLink(url: string): void {
  const webApp = getWebApp();
  if (webApp) {
    webApp.openLink(url);
  } else {
    window.open(url, '_blank');
  }
}

export function openTelegramLink(url: string): void {
  const webApp = getWebApp();
  if (webApp) {
    webApp.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
}

// Share
export function shareToTelegram(text: string, url?: string): void {
  const shareUrl = url 
    ? `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
    : `https://t.me/share/url?text=${encodeURIComponent(text)}`;
  openTelegramLink(shareUrl);
}

// Close app
export function closeWebApp(): void {
  const webApp = getWebApp();
  if (webApp) {
    webApp.close();
  }
}
