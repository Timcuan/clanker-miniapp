// Platform detection utilities
// Detects whether running in Telegram or regular web

export type Platform = 'telegram' | 'web';

// Check if running in Telegram WebApp
export function isTelegramWebApp(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!((window as any).Telegram?.WebApp?.initData);
}

// Detect current platform
export function detectPlatform(): Platform {
  if (isTelegramWebApp()) {
    return 'telegram';
  }
  return 'web';
}

// Get user ID based on platform
export interface PlatformUser {
  platform: Platform;
  id: number | null;
  username: string | null;
}

export function getPlatformUser(): PlatformUser {
  const platform = detectPlatform();
  
  if (platform === 'telegram') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    return {
      platform: 'telegram',
      id: user?.id || null,
      username: user?.username || user?.first_name || null,
    };
  }
  
  return { platform: 'web', id: null, username: null };
}
