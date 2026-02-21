'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, CheckCircle2, Shield, AlertTriangle,
  Wallet, Settings, Zap, ChevronRight
} from 'lucide-react';
import ClankerLogo from '@/components/ui/ClankerLogo';
import { useTelegramContext } from '@/components/layout/TelegramProvider';
import { showBackButton, hideBackButton, hapticFeedback } from '@/lib/telegram/webapp';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { useWallet } from '@/contexts/WalletContext';

export default function SettingsPage() {
  const router = useRouter();
  const { isTelegram } = useTelegramContext();
  const { customRpcUrl, updateRpcUrl, disconnectWallet } = useWallet();

  // Preferences
  const [autoFill, setAutoFill] = useState(true);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [cloudSync, setCloudSync] = useState(false);
  const [autoSweep, setAutoSweep] = useState(true);
  const [customGasLimit, setCustomGasLimit] = useState(false);
  const [rpcInput, setRpcInput] = useState('');
  const [isPrefsLoaded, setIsPrefsLoaded] = useState(false);

  useEffect(() => {
    if (isTelegram) {
      showBackButton(() => router.push('/'));
      return () => hideBackButton();
    }
  }, [isTelegram, router]);

  // Load preferences from localStorage + Telegram Cloud
  useEffect(() => {
    const saved = localStorage.getItem('clanker_prefs');
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (p.autoFill !== undefined) setAutoFill(p.autoFill);
        if (p.advancedMode !== undefined) setAdvancedMode(p.advancedMode);
        if (p.cloudSync !== undefined) setCloudSync(p.cloudSync);
        if (p.autoSweep !== undefined) setAutoSweep(p.autoSweep);
        if (p.customGasLimit !== undefined) setCustomGasLimit(p.customGasLimit);
      } catch { }
    }

    try {
      // @ts-ignore
      const tg = window.Telegram?.WebApp;
      if (tg?.CloudStorage) {
        tg.CloudStorage.getItem('clanker_prefs', (err: any, value?: string) => {
          if (!err && value) {
            try {
              const p = JSON.parse(value);
              if (p.autoFill !== undefined) setAutoFill(p.autoFill);
              if (p.advancedMode !== undefined) setAdvancedMode(p.advancedMode);
              if (p.cloudSync !== undefined) setCloudSync(p.cloudSync);
              if (p.autoSweep !== undefined) setAutoSweep(p.autoSweep);
              if (p.customGasLimit !== undefined) setCustomGasLimit(p.customGasLimit);
            } catch { }
          }
        });
      }
    } catch { }

    setRpcInput(customRpcUrl);
    setIsPrefsLoaded(true);
  }, [customRpcUrl]);

  // Save preferences on change
  useEffect(() => {
    if (!isPrefsLoaded) return;
    const prefs = { autoFill, advancedMode, cloudSync, autoSweep, customGasLimit };
    localStorage.setItem('clanker_prefs', JSON.stringify(prefs));

    try {
      // @ts-ignore
      const tg = window.Telegram?.WebApp;
      if (tg?.CloudStorage) {
        if (cloudSync) {
          tg.CloudStorage.setItem('clanker_prefs', JSON.stringify(prefs));
        } else {
          tg.CloudStorage.removeItem('clanker_prefs');
        }
      }
    } catch { }
  }, [autoFill, advancedMode, cloudSync, autoSweep, customGasLimit, isPrefsLoaded]);

  const handleClearData = async () => {
    const check = prompt('🚨 DANGER: Type "CONFIRM" to permanently wipe all wallets, preferences, and RPC config from this device:');
    if (check === 'CONFIRM') {
      localStorage.clear();
      try {
        // @ts-ignore
        const tg = window.Telegram?.WebApp;
        if (tg?.CloudStorage) {
          tg.CloudStorage.getKeys((err: any, keys?: string[]) => {
            if (!err && keys) tg.CloudStorage.removeItems(keys);
          });
        }
      } catch { }
      await disconnectWallet();
      window.location.reload();
    }
  };

  // Shared toggle style helper
  const toggle = (checked: boolean, color: string) =>
    `w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${checked ? color : 'bg-gray-200 dark:bg-gray-800'}`;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gray-50 dark:bg-gray-950 relative overflow-hidden transition-colors">
      <div className="absolute top-0 left-0 w-full h-[30vh] bg-gradient-to-b from-blue-50 dark:from-blue-900/10 to-transparent pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          {!isTelegram && (
            <button onClick={() => router.push('/')} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          )}
          <h1 className="font-display font-bold text-lg text-gray-900 dark:text-white">Settings</h1>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex-1 p-4 pb-20 overflow-y-auto space-y-6 relative z-10">

        {/* ── Wallet Management (link card) ───────────────────────────────── */}
        <section>
          <h2 className="font-mono text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" /> Wallets
          </h2>
          <motion.button whileTap={{ scale: 0.98 }}
            onClick={() => { router.push('/settings/wallets'); hapticFeedback('light'); }}
            className="w-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between hover:border-[#0052FF] dark:hover:border-[#0052FF]/60 transition-all group shadow-sm text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-[#0052FF]" />
              </div>
              <div>
                <p className="font-bold text-sm text-gray-800 dark:text-gray-200">Wallet Management</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Deployer keys · Bankr Burner Log · Rescue Funds</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#0052FF] transition-colors" />
          </motion.button>
        </section>

        {/* ── General Preferences ──────────────────────────────────────────── */}
        <section>
          <h2 className="font-mono text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Settings className="w-3.5 h-3.5" /> General Preferences
          </h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800 shadow-sm">

            <div className="p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">Auto-fill Template</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Automatically load saved config on deploy screen</p>
              </div>
              <button onClick={() => setAutoFill(!autoFill)} className={toggle(autoFill, 'bg-[#0052FF]')}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${autoFill ? 'left-5' : 'left-1'}`} />
              </button>
            </div>

            <div className="p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">Advanced Mode</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Show advanced deployment settings by default</p>
              </div>
              <button onClick={() => setAdvancedMode(!advancedMode)} className={toggle(advancedMode, 'bg-purple-500')}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${advancedMode ? 'left-5' : 'left-1'}`} />
              </button>
            </div>

            <div className="p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  Telegram Cloud Sync
                  <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 font-mono text-[9px] text-[#0052FF] dark:text-blue-400 uppercase font-bold">Beta</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Sync preferences across Telegram devices.<br />
                  <span className="text-amber-500 dark:text-amber-400">Private Keys are never synced.</span>
                </p>
              </div>
              <button onClick={() => setCloudSync(!cloudSync)} className={toggle(cloudSync, 'bg-sky-500')}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${cloudSync ? 'left-5' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </section>

        {/* ── Burner Proxy Config ──────────────────────────────────────────── */}
        <section>
          <h2 className="font-mono text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Burner Proxy & Transfers
          </h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800 shadow-sm">

            <div className="p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">Auto-Sweep Residuals</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[250px]">After each Bankr launch, automatically refund remaining ETH &amp; USDC from the burner back to your main wallet.</p>
              </div>
              <button onClick={() => setAutoSweep(!autoSweep)} className={toggle(autoSweep, 'bg-emerald-500')}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${autoSweep ? 'left-5' : 'left-1'}`} />
              </button>
            </div>

            <div className="p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">Override Gas Limits</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[250px]">Allow the AI Agent to dynamically increase max priority fees during network congestion.</p>
              </div>
              <button onClick={() => setCustomGasLimit(!customGasLimit)} className={toggle(customGasLimit, 'bg-orange-500')}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${customGasLimit ? 'left-5' : 'left-1'}`} />
              </button>
            </div>

            {/* Link to Burner Log */}
            <motion.button whileTap={{ scale: 0.98 }}
              onClick={() => { router.push('/settings/wallets'); hapticFeedback('light'); }}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left">
              <div>
                <h3 className="text-sm font-medium text-orange-600 dark:text-orange-400">View Bankr Burner Log</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Check balance and rescue stuck funds from past launches</p>
              </div>
              <ChevronRight className="w-4 h-4 text-orange-400" />
            </motion.button>
          </div>
        </section>

        {/* ── Network & RPC ─────────────────────────────────────────────────── */}
        <section>
          <h2 className="font-mono text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Network & RPC
          </h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3 shadow-sm">
            <div>
              <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Custom Base RPC URL</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Override the default Base node. Use Alchemy or QuickNode for faster deployments.</p>
              <div className="flex gap-2">
                <input type="url" value={rpcInput} onChange={e => setRpcInput(e.target.value)}
                  placeholder="https://mainnet.base.org"
                  className="flex-1 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 font-mono text-xs focus:border-[#0052FF] outline-none text-gray-800 dark:text-gray-200" />
                <button onClick={() => { updateRpcUrl(rpcInput); hapticFeedback('success'); }}
                  className="bg-[#0052FF] hover:bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-mono font-medium transition-colors shadow-sm">
                  Save
                </button>
              </div>
              {customRpcUrl && (
                <div className="mt-2 text-[10px] font-mono flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> Using custom endpoint
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Danger Zone ───────────────────────────────────────────────────── */}
        <section>
          <h2 className="font-mono text-xs font-bold text-red-500 dark:text-red-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Danger Zone
          </h2>
          <div className="bg-red-50/50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/50 p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-red-600 dark:text-red-400">Factory Reset</h3>
                <p className="text-xs text-red-500/80 dark:text-red-400/80 mt-1 max-w-xs">Irreversibly delete all local wallets, network settings, and preferences from this device.</p>
              </div>
              <button onClick={handleClearData}
                className="bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all shadow-sm">
                Clear Local Data
              </button>
            </div>
          </div>
        </section>

        {/* App Info */}
        <div className="pt-4 text-center space-y-2">
          <div className="mx-auto opacity-50 dark:opacity-30 grayscale flex justify-center">
            <ClankerLogo size="sm" animated={false} />
          </div>
          <p className="text-[10px] text-gray-400 font-mono">
            UMKM Terminal v2.0.0<br />Powered by Clanker SDK
          </p>
        </div>

      </main>
    </div>
  );
}
