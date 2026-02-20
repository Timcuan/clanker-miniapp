'use client';

import { motion } from 'framer-motion';
import { Shield, Lock, AlertCircle } from 'lucide-react';
import { useAccess } from '@/contexts/AccessContext';
import { useTelegramContext } from '@/components/layout/TelegramProvider';
import ClankerLogo from '@/components/ui/ClankerLogo';
import { usePathname } from 'next/navigation';

interface AccessGateProps {
  children: React.ReactNode;
}

// Routes that MUST have access/admin rights to view
const PROTECTED_ROUTES = ['/deploy', '/history', '/settings'];

export default function AccessGate({ children }: AccessGateProps) {
  const { hasAccess, isAdmin, isChecking, isInitialized } = useAccess();
  const { user } = useTelegramContext();
  const pathname = usePathname();

  // Show loading while checking access
  if (!isInitialized || isChecking) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-b from-white via-blue-50/30 to-white">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <ClankerLogo size="xl" animated={true} />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="absolute -inset-4 border-2 border-dashed border-[#0052FF]/20 rounded-full"
            />
          </div>
          <p className="font-mono text-sm text-gray-500">Verifying session...</p>
        </motion.div>
      </div>
    );
  }

  // Check if current route is in the protected list
  // Sub-paths like /deploy/confirm are also protected
  const isProtectedRoute = PROTECTED_ROUTES.some(route =>
    pathname === route || pathname?.startsWith(`${route}/`)
  );

  // Bypassed if has access OR is admin OR the route is not protected (e.g. Home page / login)
  if (hasAccess || isAdmin || !isProtectedRoute) {
    return <>{children}</>;
  }

  // Show access denied message for protected routes
  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-white via-blue-50/30 to-white relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute -top-20 -right-20 w-40 sm:w-80 h-40 sm:h-80 bg-[#0052FF]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-40 sm:w-80 h-40 sm:h-80 bg-[#0052FF]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white border border-gray-100 shadow-xl mb-4"
            >
              <Lock className="w-10 h-10 text-red-500" />
            </motion.div>
            <h1 className="font-display text-2xl font-bold text-gray-800 mb-2">
              Access Restricted
            </h1>
            <p className="font-mono text-sm text-gray-500">
              Private UMKM Terminal
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl border border-red-100 shadow-xl shadow-red-50/50 p-6 text-center space-y-4"
          >
            <div className="flex flex-col items-center gap-2">
              <Shield className="w-8 h-8 text-[#0052FF]/20" />
              <p className="font-mono text-xs text-gray-500 px-4">
                Your account is not authorized to access this section.
              </p>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
              <p className="font-mono text-[10px] text-gray-400 uppercase mb-1">Your System ID</p>
              <code className="text-lg font-bold text-gray-700 tracking-wider">
                {user?.id || 'UNKNOWN'}
              </code>
            </div>

            <div className="flex items-start gap-3 p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-left">
              <AlertCircle className="w-4 h-4 text-[#0052FF] flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#0052FF] font-medium leading-relaxed">
                Send your <b>System ID</b> to the administrator via Telegram to request access.
              </p>
            </div>

            <button
              onClick={() => useAccess().checkAccess()}
              className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-colors"
            >
              Re-verify Access
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="w-full py-3 bg-white text-gray-600 border border-gray-200 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors mt-2"
            >
              Return Home
            </button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-center mt-8 font-mono text-[10px] text-gray-400"
          >
            Terminal v1.1.2 • Restricted Production Environment
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
