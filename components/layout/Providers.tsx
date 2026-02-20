'use client';

import { useState, useEffect } from 'react';
import { TelegramProvider } from './TelegramProvider';
import { WalletProvider } from '@/contexts/WalletContext';
import { AccessProvider } from '@/contexts/AccessContext';
import AccessGate from '@/components/auth/AccessGate';

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <TelegramProvider>
      <AccessProvider>
        <AccessGate>
          <WalletProvider>{children}</WalletProvider>
        </AccessGate>
      </AccessProvider>
    </TelegramProvider>
  );
}
