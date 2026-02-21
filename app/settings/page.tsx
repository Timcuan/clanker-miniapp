'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Save, Plus, Trash2, Key, CheckCircle2, Shield, AlertTriangle, Eye, EyeOff, Copy, Wallet } from 'lucide-react';
import ClankerLogo from '@/components/ui/ClankerLogo';
import { useTelegramContext } from '@/components/layout/TelegramProvider';
// import { useWallet } from '@/contexts/WalletContext'; // We will manage local wallets here mostly
import { showBackButton, hideBackButton, hapticFeedback } from '@/lib/telegram/webapp';
import { Terminal, TerminalLine } from '@/components/ui/Terminal';
import { CLIButton, CLICard, StatusBadge } from '@/components/ui/CLIButton';
import { MatrixRain, Scanlines } from '@/components/ui/GlitchText';
import { copyToClipboard } from '@/lib/utils';
import { privateKeyToAccount } from 'viem/accounts';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { useWallet } from '@/contexts/WalletContext';
import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

interface StoredWallet {
  address: string;
  privateKey: string;
  label: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const { isTelegram } = useTelegramContext();
  const { activeWalletAddress, setActiveWallet, connectWallet, customRpcUrl, updateRpcUrl, disconnectWallet } = useWallet();

  // Local state for managing wallets
  const [wallets, setWallets] = useState<StoredWallet[]>([]);
  const [balances, setBalances] = useState<Record<string, string>>({});

  // New wallet form
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [isDeriving, setIsDeriving] = useState(false);

  // Preferences
  const [autoFill, setAutoFill] = useState(true);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [cloudSync, setCloudSync] = useState(false);
  const [autoSweep, setAutoSweep] = useState(true);
  const [customGasLimit, setCustomGasLimit] = useState(false);
  const [rpcInput, setRpcInput] = useState('');
  const [isPrefsLoaded, setIsPrefsLoaded] = useState(false);

  const fetchBalance = async (address: string) => {
    try {
      const client = createPublicClient({
        chain: base,
        transport: http(customRpcUrl || process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org')
      });
      const balance = await client.getBalance({ address: address as `0x${string}` });
      setBalances(prev => ({ ...prev, [address]: formatEther(balance) }));
    } catch (e) {
      console.error('Failed to fetch balance', e);
    }
  };

  useEffect(() => {
    if (isTelegram) {
      showBackButton(() => router.push('/'));
      return () => hideBackButton();
    }
  }, [isTelegram, router]);

  // Load preferences
  useEffect(() => {
    const saved = localStorage.getItem('clanker_prefs');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.autoFill !== undefined) setAutoFill(parsed.autoFill);
        if (parsed.advancedMode !== undefined) setAdvancedMode(parsed.advancedMode);
        if (parsed.cloudSync !== undefined) setCloudSync(parsed.cloudSync);
        if (parsed.autoSweep !== undefined) setAutoSweep(parsed.autoSweep);
        if (parsed.customGasLimit !== undefined) setCustomGasLimit(parsed.customGasLimit);
      } catch (e) {
        console.error('Failed to load prefs');
      }
    }

    // Attempt to load from CloudStorage if enabled previously
    try {
      // @ts-ignore
      const tg = window.Telegram?.WebApp;
      if (tg && tg.CloudStorage) {
        tg.CloudStorage.getItem('clanker_prefs', (err: any, value?: string) => {
          if (!err && value) {
            try {
              const parsed = JSON.parse(value);
              if (parsed.autoFill !== undefined) setAutoFill(parsed.autoFill);
              if (parsed.advancedMode !== undefined) setAdvancedMode(parsed.advancedMode);
              if (parsed.cloudSync !== undefined) setCloudSync(parsed.cloudSync);
              if (parsed.autoSweep !== undefined) setAutoSweep(parsed.autoSweep);
              if (parsed.customGasLimit !== undefined) setCustomGasLimit(parsed.customGasLimit);
            } catch (e) { }
          }
        });
      }
    } catch (e) { }

    setRpcInput(customRpcUrl);
    setIsPrefsLoaded(true);
  }, [customRpcUrl]);

  // Save preferences
  useEffect(() => {
    if (isPrefsLoaded) {
      const prefs = { autoFill, advancedMode, cloudSync, autoSweep, customGasLimit };
      localStorage.setItem('clanker_prefs', JSON.stringify(prefs));

      try {
        // @ts-ignore
        const tg = window.Telegram?.WebApp;
        if (tg && tg.CloudStorage) {
          if (cloudSync) {
            tg.CloudStorage.setItem('clanker_prefs', JSON.stringify(prefs));
          } else {
            tg.CloudStorage.removeItem('clanker_prefs');
          }
        }
      } catch (e) { }
    }
  }, [autoFill, advancedMode, cloudSync, isPrefsLoaded]);

  // Load wallets from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('clanker_wallets');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setWallets(parsed);
        // Fetch balances for all wallets
        parsed.forEach((w: StoredWallet) => fetchBalance(w.address));
      } catch (e) {
        console.error('Failed to load wallets');
      }
    }
  }, []);

  const saveWallets = (newWallets: StoredWallet[]) => {
    setWallets(newWallets);
    localStorage.setItem('clanker_wallets', JSON.stringify(newWallets));
  };

  const handleAddWallet = () => {
    if (!newKey || !newLabel) return;

    setIsDeriving(true);
    try {
      // PROPER DERIVATION using viem
      const cleanKey = newKey.trim().startsWith('0x') ? newKey.trim() : `0x${newKey.trim()}`;

      // Validate key length/format
      if (cleanKey.length !== 66) throw new Error('Invalid key length');

      const account = privateKeyToAccount(cleanKey as `0x${string}`);

      // Check for duplicates
      if (wallets.some(w => w.address.toLowerCase() === account.address.toLowerCase())) {
        alert('This wallet is already added');
        return;
      }

      const wallet: StoredWallet = {
        address: account.address,
        privateKey: cleanKey,
        label: newLabel.trim() || `Wallet ${wallets.length + 1}`
      };

      const updated = [...wallets, wallet];
      saveWallets(updated);

      // If first wallet, set active
      if (wallets.length === 0) {
        handleSetActive(wallet.address);
      }

      setNewKey('');
      setNewLabel('');
      setIsAddingMode(false);
      fetchBalance(wallet.address);
      hapticFeedback('success');
    } catch (e) {
      alert('Invalid Private Key');
    } finally {
      setIsDeriving(false);
    }
  };

  const handleDeleteWallet = (address: string) => {
    if (confirm('Are you sure? This will remove the key from this device.')) {
      const updated = wallets.filter(w => w.address !== address);
      saveWallets(updated);
      if (activeWalletAddress === address) {
        handleSetActive(updated.length > 0 ? updated[0].address : null);
      }
    }
  };

  const handleSetActive = async (address: string | null) => {
    if (!address) {
      setActiveWallet(null);
      return;
    }
    const wallet = wallets.find(w => w.address === address);
    if (wallet) {
      const result = await connectWallet(wallet.privateKey);
      if (result.success) {
        setActiveWallet(address);
        hapticFeedback('success');
      } else {
        alert('Failed to switch: ' + result.error);
        hapticFeedback('error');
      }
    }
  };

  const toggleKeyVisibility = (address: string) => {
    setShowKey(prev => ({ ...prev, [address]: !prev[address] }));
  };

  const handleClearData = async () => {
    const check = prompt('🚨 DANGER: This will permanently wipe all your saved Private Keys, Preferences, and RPC configurations from this device. Type "CONFIRM" to proceed:');
    if (check === 'CONFIRM') {
      localStorage.clear();
      try {
        // @ts-ignore
        const tg = window.Telegram?.WebApp;
        if (tg && tg.CloudStorage) {
          tg.CloudStorage.getKeys((err: any, keys?: string[]) => {
            if (!err && keys) {
              tg.CloudStorage.removeItems(keys);
            }
          });
        }
      } catch (e) { }
      await disconnectWallet();
      window.location.reload();
    }
  };

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

        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 p-4 pb-20 overflow-y-auto space-y-6 relative z-10">

        {/* Wallet Management Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-mono text-xs font-bold text-gray-400 uppercase tracking-wider">Deployer Wallets</h2>
            <button
              onClick={() => setIsAddingMode(!isAddingMode)}
              className="text-[#0052FF] text-xs font-mono font-medium flex items-center gap-1 hover:opacity-80 transition-opacity"
            >
              <Plus className="w-3 h-3" /> Add New
            </button>
          </div>

          <AnimatePresence>
            {isAddingMode && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mb-4 overflow-hidden"
              >
                <CLICard className="bg-white dark:bg-gray-900 border-[#0052FF]/20 dark:border-[#0052FF]/40 shadow-sm space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-mono text-gray-500">Label (e.g. "Main Deployer")</label>
                    <input
                      type="text"
                      value={newLabel}
                      onChange={e => setNewLabel(e.target.value)}
                      className="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 font-mono text-sm focus:border-[#0052FF] outline-none"
                      placeholder="My Wallet"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-mono text-gray-500">Private Key</label>
                    <div className="relative">
                      <input
                        type="password"
                        value={newKey}
                        onChange={e => setNewKey(e.target.value)}
                        className="w-full p-2 pr-8 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 font-mono text-sm focus:border-[#0052FF] outline-none"
                        placeholder="0x..."
                      />
                      <Key className="absolute right-2 top-2.5 w-4 h-4 text-gray-300 dark:text-gray-600" />
                    </div>
                    <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3" /> Keys are stored locally on your device only.
                    </p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <CLIButton variant="ghost" onClick={() => setIsAddingMode(false)} className="flex-1">Cancel</CLIButton>
                    <CLIButton variant="primary" onClick={handleAddWallet} className="flex-1">Save Wallet</CLIButton>
                  </div>
                </CLICard>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-3">
            {wallets.length === 0 ? (
              <div className="p-8 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-gray-100 dark:bg-gray-900 rounded-full flex items-center justify-center mb-3">
                  <Wallet className="w-6 h-6 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No wallets saved</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-[200px]">Add a wallet to start deploying tokens without re-entering keys.</p>
                <button
                  onClick={() => setIsAddingMode(true)}
                  className="mt-4 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-[#0052FF] text-[#0052FF] rounded-lg text-xs font-mono font-medium transition-all"
                >
                  + Add Wallet
                </button>
              </div>
            ) : (
              wallets.map((wallet) => (
                <motion.div
                  key={wallet.address}
                  layout
                  onClick={() => handleSetActive(wallet.address)}
                  className={`group relative p-4 rounded-xl border transition-all cursor-pointer ${activeWalletAddress === wallet.address
                    ? 'bg-white dark:bg-gray-900 border-[#0052FF] shadow-md shadow-[#0052FF]/5 ring-1 ring-[#0052FF]'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                    }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-sm ${activeWalletAddress === wallet.address ? 'text-[#0052FF]' : 'text-gray-800 dark:text-gray-200'}`}>
                        {wallet.label}
                      </span>
                      {activeWalletAddress === wallet.address && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#0052FF]/10 text-[#0052FF] text-[8px] font-bold uppercase">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-mono text-emerald-500 font-bold">
                        {balances[wallet.address] ? `${parseFloat(balances[wallet.address]).toFixed(4)} ETH` : '...'}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteWallet(wallet.address); }}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
                      <code className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate max-w-[160px]">{wallet.address}</code>
                      <button onClick={(e) => { e.stopPropagation(); copyToClipboard(wallet.address); hapticFeedback('light'); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 relative">
                        <div className="text-[10px] font-mono text-gray-400 dark:text-gray-500 flex items-center gap-1">
                          <Key className="w-3 h-3" />
                          {showKey[wallet.address] ? (
                            <span className="text-gray-600 dark:text-gray-300 break-all">{wallet.privateKey}</span>
                          ) : (
                            <span>••••••••••••••••••••••••••••••••</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleKeyVisibility(wallet.address); }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {showKey[wallet.address] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </section>

        {/* General Preferences */}
        <section>
          <h2 className="font-mono text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">General Settings</h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            <div className="p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">Auto-fill Template</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Automatically load saved config on deploy screen</p>
              </div>
              <button
                onClick={() => setAutoFill(!autoFill)}
                className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${autoFill ? 'bg-[#0052FF]' : 'bg-gray-200 dark:bg-gray-800'}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${autoFill ? 'left-5' : 'left-1'}`} />
              </button>
            </div>

            <div className="p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">Advanced Mode</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Show advanced deployment settings by default</p>
              </div>
              <button
                onClick={() => setAdvancedMode(!advancedMode)}
                className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${advancedMode ? 'bg-purple-500' : 'bg-gray-200 dark:bg-gray-800'}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${advancedMode ? 'left-5' : 'left-1'}`} />
              </button>
            </div>

            <div className="p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  Telegram Cloud Sync
                  <div className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 font-mono text-[9px] text-[#0052FF] dark:text-blue-400 uppercase font-bold">Beta</div>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Sync preferences across Telegram devices.<br /><span className="text-amber-500 dark:text-amber-400">Note: Private Keys are kept strictly local.</span></p>
              </div>
              <button
                onClick={() => setCloudSync(!cloudSync)}
                className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${cloudSync ? 'bg-sky-500' : 'bg-gray-200 dark:bg-gray-800'}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${cloudSync ? 'left-5' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </section>

        {/* Burner Config */}
        <section>
          <h2 className="font-mono text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Burner Wallets & Transfers</h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800 shadow-sm">
            <div className="p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">Auto-Sweep (0 Wei Dust)</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[250px]">Automatically refund all leftover USDC and ETH from the Burner Proxy back to your main wallet after every launch attempt.</p>
              </div>
              <button
                onClick={() => setAutoSweep(!autoSweep)}
                className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${autoSweep ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-800'}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${autoSweep ? 'left-5' : 'left-1'}`} />
              </button>
            </div>

            <div className="p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">Override Gas Limits</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[250px]">Allow the AI Agent to dynamically increase Max Priority Fees during network congestion.</p>
              </div>
              <button
                onClick={() => setCustomGasLimit(!customGasLimit)}
                className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${customGasLimit ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-800'}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${customGasLimit ? 'left-5' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </section>

        {/* Network Preferences */}
        <section>
          <h2 className="font-mono text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Network Integration</h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3 shadow-sm">
            <div>
              <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Custom Base RPC URL</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Override the default Base public node for faster deployment speeds (e.g., Alchemy, QuickNode).</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="url"
                    value={rpcInput}
                    onChange={e => setRpcInput(e.target.value)}
                    placeholder="https://mainnet.base.org"
                    className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 font-mono text-xs sm:text-sm focus:border-[#0052FF] outline-none text-gray-800 dark:text-gray-200"
                  />
                </div>
                <button
                  onClick={() => { updateRpcUrl(rpcInput); hapticFeedback('success'); }}
                  className="bg-[#0052FF] hover:bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-mono font-medium transition-colors shadow-sm"
                >
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

        {/* Danger Zone */}
        <section>
          <h2 className="font-mono text-xs font-bold text-red-500 dark:text-red-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Danger Zone</h2>
          <div className="bg-red-50/50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/50 p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-red-600 dark:text-red-400">Factory Reset</h3>
                <p className="text-xs text-red-500/80 dark:text-red-400/80 mt-1 max-w-xs">Irreversibly delete all local wallets, network settings, and user preferences from your device completely.</p>
              </div>
              <button
                onClick={handleClearData}
                className="bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all shadow-sm"
              >
                Clear Local Data
              </button>
            </div>
          </div>
        </section>

        {/* App Info */}
        < div className="pt-4 text-center space-y-2" >
          <div className="mx-auto opacity-50 dark:opacity-30 grayscale flex justify-center">
            <ClankerLogo size="sm" animated={false} />
          </div>
          <p className="text-[10px] text-gray-400 font-mono">
            UMKM Terminal v2.0.0<br />
            Powered by Clanker SDK
          </p>
        </div >

      </main >
    </div >
  );
}
