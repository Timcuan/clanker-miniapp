'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Lock, Key, AlertCircle, Check, Loader2 } from 'lucide-react';
import { useAccess } from '@/contexts/AccessContext';
import ClankerLogo from '@/components/ui/ClankerLogo';

interface AccessGateProps {
  children: React.ReactNode;
}

export default function AccessGate({ children }: AccessGateProps) {
  const { hasAccess, isChecking, isInitialized, validateCode } = useAccess();
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    const result = await validateCode(code.trim());
    
    if (result.success) {
      setShowSuccess(true);
      // Small delay to show success animation
      setTimeout(() => {
        setShowSuccess(false);
      }, 1000);
    } else {
      setSubmitError(result.error || 'Invalid access code');
      // Shake animation handled by CSS
    }
    
    setIsSubmitting(false);
  };

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
          <p className="font-mono text-sm text-gray-500">Verifying access...</p>
        </motion.div>
      </div>
    );
  }

  // If has access, render children
  if (hasAccess) {
    return <>{children}</>;
  }

  // Show access code input
  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-white via-blue-50/30 to-white relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute -top-20 -right-20 w-40 sm:w-80 h-40 sm:h-80 bg-[#0052FF]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-40 sm:w-80 h-40 sm:h-80 bg-[#0052FF]/5 rounded-full blur-3xl pointer-events-none" />
      
      <div className="flex-1 flex flex-col items-center justify-center p-4">
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
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#0052FF] to-[#1a73e8] shadow-xl shadow-[#0052FF]/20 mb-4"
            >
              <Shield className="w-10 h-10 text-white" />
            </motion.div>
            <h1 className="font-display text-2xl font-bold text-gray-800 mb-2">
              UMKM Terminal
            </h1>
            <p className="font-mono text-sm text-gray-500">
              Private Access Required
            </p>
          </div>

          {/* Access Code Form */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-xl shadow-gray-100/50 p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-4 h-4 text-[#0052FF]" />
              <span className="font-mono text-xs text-gray-500">Enter access code to continue</span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <Key className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setSubmitError(null);
                  }}
                  placeholder="ACCESS CODE"
                  className={`w-full pl-11 pr-4 py-3 bg-gray-50 border rounded-xl font-mono text-center text-lg tracking-widest uppercase transition-all focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 ${
                    submitError 
                      ? 'border-red-300 focus:border-red-400' 
                      : 'border-gray-200 focus:border-[#0052FF]'
                  }`}
                  disabled={isSubmitting}
                  autoComplete="off"
                  autoFocus
                />
              </div>

              <AnimatePresence mode="wait">
                {submitError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl"
                  >
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="font-mono text-xs text-red-600">{submitError}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                type="submit"
                disabled={!code.trim() || isSubmitting}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className={`w-full py-3 rounded-xl font-display font-semibold text-white transition-all flex items-center justify-center gap-2 ${
                  !code.trim() || isSubmitting
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-[#0052FF] to-[#1a73e8] hover:shadow-lg hover:shadow-[#0052FF]/20'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : showSuccess ? (
                  <>
                    <Check className="w-5 h-5" />
                    <span>Access Granted!</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5" />
                    <span>Verify Access</span>
                  </>
                )}
              </motion.button>
            </form>
          </motion.div>

          {/* Footer info */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-center mt-6 font-mono text-[10px] text-gray-400"
          >
            Contact admin for access code
          </motion.p>
        </motion.div>
      </div>

      {/* Version */}
      <div className="p-4 text-center">
        <p className="font-mono text-[10px] text-gray-400">UMKM Terminal v2.0</p>
      </div>
    </div>
  );
}
