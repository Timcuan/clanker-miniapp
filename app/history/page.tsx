'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, ExternalLink, RefreshCw, Copy, Check } from 'lucide-react';
import { useTelegramContext } from '@/components/layout/TelegramProvider';
import { useWallet } from '@/contexts/WalletContext';
import { showBackButton, hideBackButton } from '@/lib/telegram/webapp';
import { Terminal, TerminalLine, TerminalLoader } from '@/components/ui/Terminal';
import { CLIButton, CLICard, StatusBadge } from '@/components/ui/CLIButton';
import { GlitchText, MatrixRain, Scanlines } from '@/components/ui/GlitchText';

interface Deployment {
  id: string;
  name: string;
  symbol: string;
  image?: string | null;
  tokenAddress?: string | null;
  txHash?: string | null;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  errorMessage?: string | null;
}

export default function HistoryPage() {
  const router = useRouter();
  const { isAuthenticated, formattedAddress } = useWallet();
  const { isTelegram } = useTelegramContext();
  
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (isTelegram) {
      showBackButton(() => router.push('/'));
      return () => hideBackButton();
    }
  }, [isTelegram, router]);

  useEffect(() => {
    fetchDeployments();
  }, []);

  const fetchDeployments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/deploy', { credentials: 'include' });
      const data = await response.json();
      setDeployments(data.deployments || []);
    } catch (error) {
      console.error('Failed to fetch deployments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 sm:p-6 bg-gray-950 relative overflow-hidden">
        <div className="hidden sm:block">
          <MatrixRain />
        </div>
        <Scanlines />
        
        <Terminal title="umkm@base:~/history" className="max-w-md w-full relative z-10">
          <TerminalLine text="Error: Wallet not connected" type="error" />
          <TerminalLine text="Please connect wallet first" type="output" />
          
          <div className="mt-6">
            <CLIButton
              variant="primary"
              onClick={() => router.push('/')}
              fullWidth
            >
              Go to Terminal
            </CLIButton>
          </div>
        </Terminal>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gray-950 relative overflow-hidden">
      {/* Background Effects */}
      <div className="hidden sm:block">
        <MatrixRain />
      </div>
      <Scanlines />
      
      {/* Gradient Orbs */}
      <div className="absolute top-0 right-0 w-48 sm:w-96 h-48 sm:h-96 bg-clanker-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 sm:w-96 h-48 sm:h-96 bg-clanker-secondary/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 p-4 pt-[max(1rem,env(safe-area-inset-top))] flex items-center justify-between border-b border-gray-800/50">
        <div className="flex items-center gap-3">
          {!isTelegram && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push('/')}
              className="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </motion.button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-clanker-secondary to-clanker-primary flex items-center justify-center">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <div>
              <GlitchText text="HISTORY" className="font-mono font-bold text-white" />
              <p className="font-mono text-xs text-gray-500">history --list</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchDeployments}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </motion.button>
          <StatusBadge status="online" text={formattedAddress || 'CONNECTED'} />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 relative z-10 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          <Terminal title="umkm@base:~/history" className="w-full">
            <TerminalLine text={`Deployment history (${deployments.length} records)`} type="command" />
            
            {isLoading ? (
              <TerminalLoader text="Fetching deployments" />
            ) : deployments.length === 0 ? (
              <>
                <TerminalLine text="No deployments found" type="output" />
                
                <div className="mt-6 p-4 rounded-lg bg-gray-800/30 border border-gray-700/50">
                  <p className="font-mono text-sm text-gray-400 text-center">
                    Your token deployments will appear here
                  </p>
                </div>

                <div className="mt-6">
                  <CLIButton
                    variant="primary"
                    onClick={() => router.push('/deploy')}
                    fullWidth
                  >
                    Deploy Your First Token
                  </CLIButton>
                </div>
              </>
            ) : (
              <div className="space-y-3 mt-4">
                {deployments.map((deployment) => (
                  <CLICard key={deployment.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-mono font-bold text-white">
                            {deployment.name}
                          </span>
                          <span className="font-mono text-xs text-clanker-primary">
                            ${deployment.symbol}
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-mono rounded ${
                            deployment.status === 'confirmed' 
                              ? 'bg-green-500/20 text-green-400' 
                              : deployment.status === 'pending'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {deployment.status}
                          </span>
                        </div>
                        
                        <div className="space-y-1">
                          {deployment.tokenAddress && (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-gray-500">Token:</span>
                              <button
                                onClick={() => copyToClipboard(deployment.tokenAddress!, `token-${deployment.id}`)}
                                className="font-mono text-xs text-gray-400 hover:text-white flex items-center gap-1"
                              >
                                {truncateAddress(deployment.tokenAddress)}
                                {copiedId === `token-${deployment.id}` ? (
                                  <Check className="w-3 h-3 text-green-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          )}
                          
                          {deployment.txHash && (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-gray-500">TX:</span>
                              <a
                                href={`https://basescan.org/tx/${deployment.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-xs text-clanker-primary hover:underline flex items-center gap-1"
                              >
                                {truncateAddress(deployment.txHash)}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}

                          {deployment.errorMessage && (
                            <p className="font-mono text-xs text-red-400">
                              {deployment.errorMessage}
                            </p>
                          )}
                          
                          <p className="font-mono text-xs text-gray-600">
                            {formatDate(deployment.timestamp)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CLICard>
                ))}
              </div>
            )}
          </Terminal>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-gray-800/50">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <p className="font-mono text-xs text-gray-600">
            UMKM Terminal v1.0
          </p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-600">Base Mainnet</span>
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-2 h-2 rounded-full bg-green-500"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
