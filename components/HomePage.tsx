'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTelegramContext } from '@/components/layout/TelegramProvider';
import { useWallet } from '@/contexts/WalletContext';
import { Terminal, TerminalLine, TerminalLoader, ResponsiveAscii } from '@/components/ui/Terminal';
import { MatrixRain } from '@/components/ui/GlitchText';
import { CLIButton, CLICard, CLIInput, StatusBadge } from '@/components/ui/CLIButton';
import { Key, Zap, Shield, ArrowRight, LogOut, Settings, Info, X, Bot, Rocket } from 'lucide-react';
import ClankerLogo from '@/components/ui/ClankerLogo';
import AboutSection from '@/components/ui/AboutSection';

type AuthStep = 'input-key' | 'connecting' | 'connected';

export default function HomePage() {
  const router = useRouter();
  const { isTelegram, user: telegramUser } = useTelegramContext();
  const {
    isAuthenticated,
    formattedAddress,
    address,
    balance,
    connectWallet,
    disconnectWallet,
    isLoading,
    refreshBalance
  } = useWallet();

  const [step, setStep] = useState<AuthStep>('input-key');
  const [privateKey, setPrivateKey] = useState('');
  const [error, setError] = useState('');
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [showAscii, setShowAscii] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  // Initialize terminal sequence
  useEffect(() => {
    const timer = setTimeout(() => setShowAscii(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // Check if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setStep('connected');
    }
  }, [isAuthenticated]);

  const addTerminalLine = (line: string) => {
    setTerminalLines(prev => [...prev, line]);
  };

  const handleConnect = async () => {
    if (!privateKey.trim()) {
      setError('Private key is required');
      return;
    }

    setError('');
    setStep('connecting');
    setTerminalLines([]);
    addTerminalLine('Validating private key...');

    const result = await connectWallet(privateKey);

    if (result.success) {
      addTerminalLine('Private key validated');
      addTerminalLine('Uploading to deployer backend...');
      await new Promise(r => setTimeout(r, 500));
      addTerminalLine('Fetching balance from Base network...');
      await refreshBalance();
      addTerminalLine('Wallet connected successfully');
      setStep('connected');
      setPrivateKey('');
    } else {
      setError(result.error || 'Failed to connect wallet');
      setStep('input-key');
    }
  };

  const handleDisconnect = async () => {
    await disconnectWallet();
    setStep('input-key');
    setTerminalLines([]);
    setPrivateKey('');
  };

  const handleDeploy = () => {
    router.push('/deploy');
  };

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden bg-gradient-to-b from-white via-blue-50/30 to-white">
      {/* Background Effects - subtle for clean look */}
      <div className="hidden sm:block">
        <MatrixRain />
      </div>

      {/* Gradient Orbs - subtle blue tints */}
      <div className="absolute -top-20 -left-20 w-40 sm:w-80 h-40 sm:h-80 bg-[#0052FF]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-40 sm:w-80 h-40 sm:h-80 bg-[#0052FF]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header - with safe area for iOS */}
      <header className="relative z-10 px-3 sm:px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between border-b border-gray-100/80 bg-white/90 backdrop-blur-md">
        <div className="flex items-center min-w-0 flex-1">
          <ClankerLogo size="md" animated={true} showText={true} />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* About Button */}
          <button
            onClick={() => setShowAbout(!showAbout)}
            className={`p-2 rounded-xl transition-all ${showAbout
              ? 'bg-[#0052FF] text-white shadow-lg shadow-[#0052FF]/20'
              : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
              }`}
          >
            {showAbout ? <X className="w-4 h-4" /> : <Info className="w-4 h-4" />}
          </button>

          {isAuthenticated && (
            <>
              <div className="hidden sm:block">
                <StatusBadge status="online" text={formattedAddress || 'CONNECTED'} />
              </div>
              <button
                onClick={handleDisconnect}
                className="p-2 rounded-xl hover:bg-red-50 transition-colors text-gray-500 hover:text-red-500"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-start sm:justify-center px-3 sm:px-4 py-4 relative z-10 overflow-y-auto">
        <div className="w-full max-w-lg sm:max-w-2xl">
          {/* About Section - Overlay */}
          <AnimatePresence>
            {showAbout && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="mb-4"
              >
                <div className="rounded-2xl bg-white/95 border border-gray-100 p-4 sm:p-6 backdrop-blur-sm shadow-lg">
                  <AboutSection />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Terminal - Hide when About is shown */}
          <AnimatePresence>
            {!showAbout && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Terminal title="umkm@base:~" className="w-full">
                  {/* ASCII Art - Responsive */}
                  <AnimatePresence>
                    {showAscii && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mb-4"
                      >
                        <ResponsiveAscii />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Welcome Message */}
                  <div className="space-y-1 mb-4">
                    <TerminalLine
                      text="Welcome to UMKM Terminal"
                      type="info"
                      delay={500}
                      typing
                    />
                    <TerminalLine
                      text="Deploy tokens on Base in seconds"
                      type="output"
                      delay={1500}
                    />
                    {isTelegram && telegramUser && (
                      <TerminalLine
                        text={`Hi, ${telegramUser.first_name}!`}
                        type="success"
                        delay={2000}
                      />
                    )}
                  </div>

                  {/* Dynamic Content Based on Step */}
                  <AnimatePresence mode="wait">
                    {step === 'input-key' && (
                      <motion.div
                        key="input-key"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4"
                      >
                        <TerminalLine text="Enter deployer private key:" type="command" />

                        <CLIInput
                          value={privateKey}
                          onChange={(v) => {
                            setPrivateKey(v);
                            setError('');
                          }}
                          type="password"
                          placeholder="0x..."
                          label="privateKey"
                          error={error}
                        />

                        <CLIButton
                          variant="primary"
                          onClick={handleConnect}
                          loading={isLoading}
                          fullWidth
                          icon={<Key className="w-4 h-4" />}
                        >
                          Connect Wallet
                        </CLIButton>

                        <div className="mt-4 p-3 rounded-xl bg-umkm-light/50 border border-umkm-primary/10">
                          <p className="font-mono text-xs text-gray-500">
                            Your private key will be securely stored on the backend for token deployment operations.
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {step === 'connecting' && (
                      <motion.div
                        key="connecting"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-2"
                      >
                        {terminalLines.map((line, i) => (
                          <TerminalLine key={i} text={line} type="output" />
                        ))}
                        <TerminalLoader text="Connecting to Base network" />
                      </motion.div>
                    )}

                    {step === 'connected' && (
                      <motion.div
                        key="connected"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-2"
                      >
                        <TerminalLine text="Wallet connected successfully" type="success" />
                        <TerminalLine
                          text={`Address: ${address}`}
                          type="output"
                        />
                        <TerminalLine
                          text={`Balance: ${balance ? `${parseFloat(balance).toFixed(6)} ETH` : 'Loading...'}`}
                          type="output"
                        />
                        <TerminalLine text="Network: Base Mainnet (Chain ID: 8453)" type="output" />
                        <TerminalLine text="Status: Ready for deployment" type="success" />

                        <div className="border-t border-gray-100 pt-3 sm:pt-4 mt-3 sm:mt-4">
                          <TerminalLine text="Available commands:" type="info" />

                          <div className="grid gap-2 sm:gap-3 mt-3 sm:mt-4">
                            <CLICard hoverable onClick={handleDeploy} className="group">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#0052FF] flex items-center justify-center flex-shrink-0">
                                  <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                  <h3 className="font-display text-sm sm:text-base text-gray-800 font-semibold">Clanker Deploy</h3>
                                  <p className="font-mono text-[10px] sm:text-xs text-gray-500 truncate">Advanced Token Factory</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#0052FF] transition-colors flex-shrink-0" />
                              </div>
                            </CLICard>

                            <CLICard hoverable onClick={() => router.push('/bankr/launch')} className="group">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
                                  <Rocket className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                  <h3 className="font-display text-sm sm:text-base text-gray-800 font-semibold">Bankr Launch</h3>
                                  <p className="font-mono text-[10px] sm:text-xs text-gray-500 truncate">AI-Assisted Token Launch</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-orange-500 transition-colors flex-shrink-0" />
                              </div>
                            </CLICard>

                            <CLICard hoverable onClick={() => router.push('/bankr')} className="group">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-500 flex items-center justify-center flex-shrink-0">
                                  <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                  <h3 className="font-display text-sm sm:text-base text-gray-800 font-semibold">Agent Bankr</h3>
                                  <p className="font-mono text-[10px] sm:text-xs text-gray-500 truncate">AI Trading & Market Analysis</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-purple-500 transition-colors flex-shrink-0" />
                              </div>
                            </CLICard>

                            <CLICard hoverable onClick={() => router.push('/history')} className="group">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
                                  <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                  <h3 className="font-display text-sm sm:text-base text-gray-800 font-semibold">History</h3>
                                  <p className="font-mono text-[10px] sm:text-xs text-gray-500 truncate">View past deployments</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-emerald-500 transition-colors flex-shrink-0" />
                              </div>
                            </CLICard>

                            <CLICard hoverable onClick={() => router.push('/settings')} className="group">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                                  <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                  <h3 className="font-display text-sm sm:text-base text-gray-800 font-semibold">Settings</h3>
                                  <p className="font-mono text-[10px] sm:text-xs text-gray-500 truncate">Configuration</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-700 transition-colors flex-shrink-0" />
                              </div>
                            </CLICard>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Terminal>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer - with safe area for iOS */}
      <footer className="relative z-10 px-3 sm:px-4 py-2.5 sm:py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-gray-100/80 bg-white/90 backdrop-blur-md">
        <div className="flex items-center justify-between max-w-lg sm:max-w-2xl mx-auto">
          <p className="font-mono text-[10px] sm:text-xs text-gray-400">
            UMKM v2.0
          </p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] sm:text-xs text-gray-400">Base</span>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
