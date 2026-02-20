'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTelegramContext } from '@/components/layout/TelegramProvider';
import { useWallet } from '@/contexts/WalletContext';
import { Terminal, TerminalLine, TerminalLoader, ResponsiveAscii } from '@/components/ui/Terminal';
import { MatrixRain } from '@/components/ui/GlitchText';
import { CLIButton, CLICard, CLIInput, StatusBadge } from '@/components/ui/CLIButton';
import { Key, Zap, Shield, ArrowRight, LogOut, Settings, Info, X, Check, Copy } from 'lucide-react';
import { copyToClipboard } from '@/lib/utils';
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
    generateWallet,
    disconnectWallet,
    isLoading,
    refreshBalance
  } = useWallet();

  const [step, setStep] = useState<AuthStep | 'backup-wallet'>('input-key');
  const [privateKey, setPrivateKey] = useState('');
  const [error, setError] = useState('');
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [showAscii, setShowAscii] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  // New wallet state for backup
  const [generatedWallet, setGeneratedWallet] = useState<{ address: string, privateKey: string } | null>(null);
  const [hasBackedUp, setHasBackedUp] = useState(false);

  const [copied, setCopied] = useState(false);

  // Protect against accidental refresh during backup
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (step === 'backup-wallet' && generatedWallet) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [step, generatedWallet]);

  const handleCopyKey = async () => {
    if (!generatedWallet?.privateKey) return;
    try {
      const success = await copyToClipboard(generatedWallet.privateKey);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        setHasBackedUp(true);
      }
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const [ethPrice, setEthPrice] = useState<number | null>(null);

  // Fetch ETH Price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/0x4200000000000000000000000000000000000006');
        const data = await res.json();
        if (data.pairs && data.pairs.length > 0) {
          setEthPrice(parseFloat(data.pairs[0].priceUsd));
        }
      } catch (e) {
        console.error('Failed to fetch ETH price');
      }
    };
    fetchPrice();
  }, []);

  // Initialize terminal sequence
  useEffect(() => {
    const timer = setTimeout(() => setShowAscii(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // Check if already authenticated
  useEffect(() => {
    if (isAuthenticated && step !== 'backup-wallet') {
      setStep('connected');
    }
  }, [isAuthenticated, step]);

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

  const handleGenerate = async () => {
    setError('');
    setStep('connecting');
    setTerminalLines([]);
    addTerminalLine('Generating secure wallet...');

    const result = await generateWallet();

    if (result.success && result.address && result.privateKey) {
      setGeneratedWallet({ address: result.address, privateKey: result.privateKey });
      addTerminalLine('Wallet generated successfully');
      addTerminalLine(`Address: ${result.address}`);
      setStep('backup-wallet');
    } else {
      setError(result.error || 'Failed to generate wallet');
      setStep('input-key');
    }
  };

  const confirmBackup = () => {
    if (!hasBackedUp) {
      setError('Please confirm you have backed up your key');
      return;
    }
    setGeneratedWallet(null);
    setStep('connected');
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

  // Helper to format balance with USD
  const formatBalance = (bal: string | null) => {
    if (!bal) return 'Loading...';
    const eth = parseFloat(bal);
    if (ethPrice) {
      const usd = (eth * ethPrice).toFixed(2);
      return `${eth.toFixed(4)} ETH (~$${usd})`;
    }
    return `${eth.toFixed(4)} ETH`;
  };

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden bg-gradient-to-b from-white via-blue-50/30 to-white dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 transition-colors duration-300">
      {/* Background Effects - subtle for clean look */}
      <div className="hidden sm:block opacity-50 dark:opacity-30">
        <MatrixRain />
      </div>

      {/* Gradient Orbs - subtle blue tints */}
      <div className="absolute -top-20 -left-20 w-40 sm:w-80 h-40 sm:h-80 bg-[#0052FF]/5 dark:bg-[#0052FF]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-40 sm:w-80 h-40 sm:h-80 bg-[#0052FF]/5 dark:bg-[#0052FF]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header - with safe area for iOS */}
      <header className="relative z-10 px-3 sm:px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between border-b border-gray-100/80 dark:border-gray-800/80 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md transition-colors">
        <div className="flex items-center min-w-0 flex-1">
          <ClankerLogo size="md" animated={true} showText={true} />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* About Button */}
          <button
            onClick={() => setShowAbout(!showAbout)}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 py-2 rounded-xl transition-all font-mono text-xs font-semibold ${showAbout
              ? 'bg-[#0052FF] text-white shadow-lg shadow-[#0052FF]/30'
              : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-700 shadow-sm'
              }`}
          >
            {showAbout ? <X className="w-4 h-4" /> : <Info className="w-4 h-4" />}
            <span className="hidden sm:inline">{showAbout ? 'Close' : 'About'}</span>
          </button>

          {isAuthenticated && (
            <>
              <div className="hidden sm:block">
                <StatusBadge status="online" text={formattedAddress || 'CONNECTED'} />
              </div>
              <button
                onClick={handleDisconnect}
                className="p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800"
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
                initial={{ opacity: 0, scale: 0.95, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -20 }}
                transition={{ duration: 0.3, type: "spring", bounce: 0.4 }}
                className="mb-4 relative z-50 w-full"
              >
                <div className="rounded-2xl bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/60 p-5 sm:p-8 shadow-2xl dark:shadow-blue-900/5">
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
                        <TerminalLine text="Select authentication method:" type="command" />

                        <div className="grid gap-3">
                          <CLIButton
                            variant="primary"
                            onClick={handleGenerate}
                            loading={isLoading}
                            fullWidth
                            icon={<Zap className="w-4 h-4" />}
                            className="bg-gradient-to-r from-[#0052FF] to-[#0039b3]"
                          >
                            Create New Wallet (Recommended)
                          </CLIButton>

                          <div className="relative flex items-center py-2">
                            <div className="flex-grow border-t border-gray-200 dark:border-gray-800"></div>
                            <span className="flex-shrink-0 mx-4 text-gray-400 dark:text-gray-500 text-xs font-mono">OR</span>
                            <div className="flex-grow border-t border-gray-200 dark:border-gray-800"></div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-[10px] font-mono text-gray-400 ml-1">Connect Existing Wallet:</p>
                            <CLIInput
                              value={privateKey}
                              onChange={(v) => {
                                setPrivateKey(v);
                                setError('');
                              }}
                              type="password"
                              placeholder="0x... (Private Key)"
                              label="privateKey"
                              error={error}
                            />
                            <CLIButton
                              variant="ghost"
                              onClick={handleConnect}
                              loading={isLoading && !!privateKey}
                              fullWidth
                              icon={<Key className="w-4 h-4" />}
                            >
                              Connect Private Key
                            </CLIButton>
                          </div>
                        </div>

                        <div className="mt-4 p-3 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
                          <p className="font-mono text-[10px] text-blue-600 dark:text-blue-400 flex gap-2">
                            <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                            <span>
                              "Create New Wallet" generates a secure key on the server. Back it up immediately! It's never shown again.
                            </span>
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {step === 'backup-wallet' && generatedWallet && (
                      <motion.div
                        key="backup"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4"
                      >
                        <TerminalLine text="⚠️ IMPORTANT: BACKUP YOUR KEY" type="warning" />

                        <div className="p-4 rounded-xl bg-yellow-50/80 dark:bg-yellow-900/10 border border-yellow-200/60 dark:border-yellow-700/30 backdrop-blur-sm space-y-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="font-mono text-xs text-yellow-800 dark:text-yellow-500 font-bold uppercase tracking-wider">Private Key</p>
                              <span className="text-[10px] text-yellow-600/80 dark:text-yellow-500/80 font-mono">Tap to copy</span>
                            </div>
                            <button
                              onClick={handleCopyKey}
                              className="w-full text-left group relative"
                            >
                              <div className="p-3 bg-white/80 dark:bg-black/30 hover:bg-white dark:hover:bg-black/50 rounded-lg border border-yellow-200/50 dark:border-yellow-700/50 font-mono text-xs break-all shadow-sm transition-all group-hover:shadow-md group-hover:border-yellow-300 dark:group-hover:border-yellow-600 dark:text-gray-200">
                                {generatedWallet.privateKey}
                              </div>
                              <div className="absolute top-1/2 right-2 -translate-y-1/2 p-1.5 rounded-md bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              </div>
                            </button>
                            {copied && (
                              <motion.p
                                initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                                className="text-[10px] text-green-600 dark:text-green-400 font-mono text-right"
                              >
                                Copied to clipboard!
                              </motion.p>
                            )}
                          </div>

                          <div className="space-y-1 pt-2 border-t border-yellow-200/50 dark:border-yellow-700/30">
                            <p className="font-mono text-xs text-yellow-800 dark:text-yellow-500 font-bold uppercase tracking-wider">Address</p>
                            <div className="flex items-center gap-2">
                              <p className="font-mono text-xs text-gray-600 dark:text-gray-400 break-all select-all">
                                {generatedWallet.address}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                          <p className="text-[10px] text-red-600 dark:text-red-400 font-mono flex items-start gap-2">
                            <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                            <span>
                              This key is NOT saved in the app. If you lose it, your funds are lost forever. Save it now!
                            </span>
                          </p>
                        </div>

                        <div
                          className="flex items-center gap-3 cursor-pointer p-3 hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition-all border border-transparent hover:border-gray-100 dark:hover:border-white/10"
                          onClick={() => setHasBackedUp(!hasBackedUp)}
                        >
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${hasBackedUp ? 'bg-[#0052FF] border-[#0052FF] shadow-sm' : 'bg-white dark:bg-black/30 border-gray-300 dark:border-gray-700'}`}>
                            {hasBackedUp && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <span className="font-mono text-xs text-gray-600 dark:text-gray-400 select-none flex-1">
                            I have explicitly saved this private key in a secure location
                          </span>
                        </div>

                        <CLIButton
                          variant="primary"
                          onClick={confirmBackup}
                          disabled={!hasBackedUp}
                          fullWidth
                          className={hasBackedUp ? 'shadow-lg shadow-blue-500/20' : 'opacity-50'}
                        >
                          Continue to Terminal
                        </CLIButton>
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
                          text={`Balance: ${formatBalance(balance)}`}
                          type="info"
                        />
                        <TerminalLine text="Network: Base Mainnet (Chain ID: 8453)" type="output" />
                        <TerminalLine text="Status: Ready for deployment" type="success" />

                        <div className="border-t border-gray-100 dark:border-gray-800 pt-3 sm:pt-4 mt-3 sm:mt-4">
                          <TerminalLine text="Available commands:" type="info" />

                          <div className="grid gap-2 sm:gap-3 mt-3 sm:mt-4">
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }}>
                              <CLICard hoverable onClick={handleDeploy} className="group overflow-hidden relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/0 to-blue-500/0 group-hover:via-blue-500/5 transition-all duration-500" />
                                <div className="flex items-center gap-3 relative z-10">
                                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#0052FF] flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform duration-300">
                                    <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                                  </div>
                                  <div className="flex-1 text-left min-w-0">
                                    <h3 className="font-display text-sm sm:text-base text-gray-800 dark:text-gray-100 font-semibold group-hover:text-[#0052FF] transition-colors">Deploy Token</h3>
                                    <p className="font-mono text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">Launch on Base Network</p>
                                  </div>
                                  <motion.div
                                    whileHover={{ x: 5 }}
                                    className="flex-shrink-0"
                                  >
                                    <ArrowRight className="w-4 h-4 text-gray-400 dark:text-gray-600 group-hover:text-[#0052FF] transition-colors" />
                                  </motion.div>
                                </div>
                              </CLICard>
                            </motion.div>

                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.3 }}>
                              <CLICard hoverable onClick={() => router.push('/history')} className="group overflow-hidden relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/0 to-emerald-500/0 group-hover:via-emerald-500/5 transition-all duration-500" />
                                <div className="flex items-center gap-3 relative z-10">
                                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-300">
                                    <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                                  </div>
                                  <div className="flex-1 text-left min-w-0">
                                    <h3 className="font-display text-sm sm:text-base text-gray-800 dark:text-gray-100 font-semibold group-hover:text-emerald-500 transition-colors">History</h3>
                                    <p className="font-mono text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">View past deployments</p>
                                  </div>
                                  <motion.div
                                    whileHover={{ x: 5 }}
                                    className="flex-shrink-0"
                                  >
                                    <ArrowRight className="w-4 h-4 text-gray-400 dark:text-gray-600 group-hover:text-emerald-500 transition-colors" />
                                  </motion.div>
                                </div>
                              </CLICard>
                            </motion.div>

                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.3 }}>
                              <CLICard hoverable onClick={() => router.push('/settings')} className="group overflow-hidden relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-gray-500/0 via-gray-500/0 to-gray-500/0 group-hover:via-gray-500/5 transition-all duration-500" />
                                <div className="flex items-center gap-3 relative z-10">
                                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
                                    <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-300" />
                                  </div>
                                  <div className="flex-1 text-left min-w-0">
                                    <h3 className="font-display text-sm sm:text-base text-gray-800 dark:text-gray-100 font-semibold group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">Settings</h3>
                                    <p className="font-mono text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">Configuration</p>
                                  </div>
                                  <motion.div
                                    whileHover={{ x: 5 }}
                                    className="flex-shrink-0"
                                  >
                                    <ArrowRight className="w-4 h-4 text-gray-400 dark:text-gray-600 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors" />
                                  </motion.div>
                                </div>
                              </CLICard>
                            </motion.div>
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
      </main >

      {/* Footer - with safe area for iOS */}
      < footer className="relative z-10 px-3 sm:px-4 py-2.5 sm:py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-gray-100/80 dark:border-gray-800/80 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md transition-colors" >
        <div className="flex items-center justify-between max-w-lg sm:max-w-2xl mx-auto">
          <p className="font-mono text-[10px] sm:text-xs text-gray-400 dark:text-gray-600">
            UMKM v1.1.2
          </p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] sm:text-xs text-gray-400 dark:text-gray-600">Base</span>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
            />
          </div>
        </div>
      </footer >
    </div >
  );
}
