'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Wallet, Zap, Plus, Trash2, Key, Eye, EyeOff,
    Copy, CheckCircle2, AlertTriangle, ExternalLink, RefreshCw,
    ShieldCheck, Clock, LifeBuoy, ChevronRight, Rocket
} from 'lucide-react';
import { useTelegramContext } from '@/components/layout/TelegramProvider';
import { useWallet } from '@/contexts/WalletContext';
import { showBackButton, hideBackButton, hapticFeedback } from '@/lib/telegram/webapp';
import { CLIButton } from '@/components/ui/CLIButton';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

import { RecoveryManager } from '@/components/ui/RecoveryManager';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface StoredWallet {
    address: string;
    privateKey: string;
    label: string;
}

export interface BurnerLogEntry {
    id: string;           // unique id
    address: string;      // burner address (no PK)
    symbol: string;       // token symbol
    timestamp: number;    // unix ms
    txHash?: string;      // deployment tx
    sweepStatus: 'swept' | 'pending' | 'failed' | 'unknown';
    burnerPrivateKey?: string; // only if user opted in (not sent by default)
}

type Tab = 'clanker' | 'bankr';

const BURNER_LOG_KEY = 'bankr_burner_log';
const WALLETS_KEY = 'clanker_wallets';

// ─── Helpers ───────────────────────────────────────────────────────────────────
function short(addr: string) {
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function ago(ts: number) {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

function getClient(rpcUrl?: string) {
    return createPublicClient({
        chain: base,
        transport: http(rpcUrl || process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
    });
}

async function getEthBalance(address: string, rpcUrl?: string): Promise<string> {
    const bal = await getClient(rpcUrl).getBalance({ address: address as `0x${string}` });
    return formatEther(bal);
}

async function getUsdcBalance(address: string, rpcUrl?: string): Promise<string> {
    const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const ABI = [{ inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const;
    const raw = await getClient(rpcUrl).readContract({ address: USDC, abi: ABI, functionName: 'balanceOf', args: [address as `0x${string}`] }) as bigint;
    return (Number(raw) / 1e6).toFixed(2);
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function WalletManagementPage() {
    const router = useRouter();
    const { isTelegram } = useTelegramContext();
    const { activeWalletAddress, setActiveWallet, connectWallet, customRpcUrl } = useWallet();

    const [tab, setTab] = useState<Tab>('clanker');

    // ── Clanker Wallets ──
    const [wallets, setWallets] = useState<StoredWallet[]>([]);
    const [balances, setBalances] = useState<Record<string, string>>({});
    const [showKey, setShowKey] = useState<Record<string, boolean>>({});
    const [copied, setCopied] = useState<string | null>(null);
    const [isAddingMode, setIsAddingMode] = useState(false);
    const [newKey, setNewKey] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [isDeriving, setIsDeriving] = useState(false);

    // ── Bankr Burner Log ──
    const [burnerLog, setBurnerLog] = useState<BurnerLogEntry[]>([]);
    const [burnerBalances, setBurnerBalances] = useState<Record<string, { eth: string; usdc: string }>>({});
    const [fetchingBalance, setFetchingBalance] = useState<Record<string, boolean>>({});
    const [sweeping, setSweeping] = useState<Record<string, boolean>>({});
    const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

    // ── Init ──────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (isTelegram) {
            showBackButton(() => router.push('/settings'));
            return () => hideBackButton();
        }
    }, [isTelegram, router]);

    useEffect(() => {
        // Load wallets
        try {
            const saved = localStorage.getItem(WALLETS_KEY);
            if (saved) {
                const parsed: StoredWallet[] = JSON.parse(saved);
                setWallets(parsed);
                parsed.forEach(w => fetchWalletBalance(w.address));
            }
        } catch { }

        // Load burner log
        try {
            const log = localStorage.getItem(BURNER_LOG_KEY);
            if (log) setBurnerLog(JSON.parse(log));
        } catch { }
    }, []);

    // ── Clanker Wallet Helpers ────────────────────────────────────────────────────
    const fetchWalletBalance = useCallback(async (address: string) => {
        try {
            const bal = await getEthBalance(address, customRpcUrl);
            setBalances(prev => ({ ...prev, [address]: bal }));
        } catch { }
    }, [customRpcUrl]);

    const saveWallets = (next: StoredWallet[]) => {
        setWallets(next);
        localStorage.setItem(WALLETS_KEY, JSON.stringify(next));
    };

    const handleAddWallet = () => {
        if (!newKey || !newLabel) return;
        setIsDeriving(true);
        try {
            const cleanKey = newKey.trim().startsWith('0x') ? newKey.trim() : `0x${newKey.trim()}`;
            if (cleanKey.length !== 66) throw new Error('Invalid key length');
            const account = privateKeyToAccount(cleanKey as `0x${string}`);
            if (wallets.some(w => w.address.toLowerCase() === account.address.toLowerCase())) {
                alert('This wallet is already added');
                return;
            }
            const wallet: StoredWallet = { address: account.address, privateKey: cleanKey, label: newLabel.trim() || `Wallet ${wallets.length + 1}` };
            const updated = [...wallets, wallet];
            saveWallets(updated);
            if (wallets.length === 0) handleSetActive(wallet.address);
            setNewKey(''); setNewLabel(''); setIsAddingMode(false);
            fetchWalletBalance(wallet.address);
            hapticFeedback('success');
        } catch { alert('Invalid Private Key'); }
        finally { setIsDeriving(false); }
    };

    const handleDeleteWallet = (address: string) => {
        if (!confirm('Remove this wallet? The key will be deleted from this device.')) return;
        const updated = wallets.filter(w => w.address !== address);
        saveWallets(updated);
        if (activeWalletAddress === address) {
            setActiveWallet(updated.length > 0 ? updated[0].address : null);
        }
    };

    const handleSetActive = async (address: string | null) => {
        if (!address) { setActiveWallet(null); return; }
        const wallet = wallets.find(w => w.address === address);
        if (!wallet) return;
        const result = await connectWallet(wallet.privateKey);
        if (result.success) { setActiveWallet(address); hapticFeedback('success'); }
        else { alert('Failed to switch: ' + result.error); }
    };

    const copyText = async (text: string, key: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        hapticFeedback('light');
        setTimeout(() => setCopied(null), 2000);
    };

    // ── Bankr Burner Log Helpers ──────────────────────────────────────────────────
    const fetchBurnerBalance = async (entry: BurnerLogEntry) => {
        setFetchingBalance(p => ({ ...p, [entry.id]: true }));
        try {
            const [eth, usdc] = await Promise.all([
                getEthBalance(entry.address, customRpcUrl),
                getUsdcBalance(entry.address, customRpcUrl),
            ]);
            setBurnerBalances(p => ({ ...p, [entry.id]: { eth, usdc } }));
        } catch { }
        finally { setFetchingBalance(p => ({ ...p, [entry.id]: false })); }
    };

    const handleManualSweep = async (entry: BurnerLogEntry) => {
        if (!entry.burnerPrivateKey) return;
        setSweeping(p => ({ ...p, [entry.id]: true }));
        hapticFeedback('medium');
        try {
            const res = await fetch('/api/bankr/sweep', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ burnerPrivateKey: entry.burnerPrivateKey }),
            });
            const data = await res.json();
            if (data.success) {
                hapticFeedback('success');
                // Update log entry status
                const updated = burnerLog.map(e => e.id === entry.id ? { ...e, sweepStatus: 'swept' as const } : e);
                setBurnerLog(updated);
                localStorage.setItem(BURNER_LOG_KEY, JSON.stringify(updated));
                // Refresh balance
                fetchBurnerBalance(entry);
            } else {
                alert('Sweep failed: ' + (data.error || 'Unknown'));
                hapticFeedback('error');
            }
        } catch (err) {
            alert('Sweep error: ' + (err instanceof Error ? err.message : 'Network error'));
        } finally {
            setSweeping(p => ({ ...p, [entry.id]: false }));
        }
    };

    const clearSweptEntries = () => {
        const updated = burnerLog.filter(e => e.sweepStatus !== 'swept');
        setBurnerLog(updated);
        localStorage.setItem(BURNER_LOG_KEY, JSON.stringify(updated));
    };

    const getSweepBadge = (status: BurnerLogEntry['sweepStatus']) => {
        switch (status) {
            case 'swept': return <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[10px] font-mono font-bold">✓ Swept</span>;
            case 'pending': return <span className="px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 text-[10px] font-mono font-bold animate-pulse">⏳ Pending</span>;
            case 'failed': return <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-mono font-bold">✗ Failed</span>;
            default: return <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 text-[10px] font-mono">Unknown</span>;
        }
    };

    // ─── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-[100dvh] flex flex-col bg-gray-50 dark:bg-gray-950 relative overflow-hidden transition-colors">
            {/* Background */}
            <div className="absolute top-0 left-0 w-full h-[30vh] bg-gradient-to-b from-blue-50 dark:from-blue-900/10 to-transparent pointer-events-none" />

            {/* Header */}
            <header className="relative z-10 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
                {!isTelegram && (
                    <button onClick={() => router.push('/settings')}
                        className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                        <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                )}
                <div>
                    <h1 className="text-xl font-bold font-mono tracking-tight text-white flex items-center gap-2">Wallet Settings <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400">v2.8.0</span></h1>
                    <p className="font-mono text-[10px] text-gray-400">Keys · Rescue</p>
                </div>
            </header>

            {/* Tabs */}
            <div className="relative z-10 px-4 pt-4 pb-2">
                <div className="bg-gray-100 dark:bg-gray-900 rounded-xl p-1 grid grid-cols-2 gap-1">
                    <button
                        onClick={() => setTab('clanker')}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-mono font-bold transition-all ${tab === 'clanker'
                            ? 'bg-white dark:bg-gray-800 text-[#0052FF] shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                        <Rocket className="w-3.5 h-3.5" /> Clanker Wallets
                    </button>
                    <button
                        onClick={() => setTab('bankr')}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-mono font-bold transition-all ${tab === 'bankr'
                            ? 'bg-white dark:bg-gray-800 text-orange-500 shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                        <Zap className="w-3.5 h-3.5" /> Bankr Burner Log
                    </button>
                </div>
            </div>

            {/* Content */}
            <main className="flex-1 p-4 pb-24 overflow-y-auto relative z-10">
                <AnimatePresence mode="wait">

                    {/* ── TAB: CLANKER DEPLOYER WALLETS ─────────────────────────────── */}
                    {tab === 'clanker' && (
                        <motion.div key="clanker" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                            className="space-y-4">

                            {/* Info Banner */}
                            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 flex gap-2 items-start">
                                <ShieldCheck className="w-4 h-4 text-[#0052FF] shrink-0 mt-0.5" />
                                <p className="text-xs text-blue-700 dark:text-blue-300">
                                    Deployer wallets are stored <strong>locally on your device only</strong>. They are used to deploy tokens directly via the Clanker SDK.
                                </p>
                            </div>

                            {/* Add wallet form */}
                            <AnimatePresence>
                                {isAddingMode && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                        <div className="bg-white dark:bg-gray-900 rounded-xl border border-[#0052FF]/20 p-4 space-y-3 shadow-sm">
                                            <h3 className="font-mono text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                                <Plus className="w-3.5 h-3.5 text-[#0052FF]" /> Add Deployer Wallet
                                            </h3>
                                            <div className="space-y-1">
                                                <label className="text-xs font-mono text-gray-500">Label</label>
                                                <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                                                    className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 font-mono text-sm focus:border-[#0052FF] outline-none"
                                                    placeholder="Main Deployer, Alpha Wallet..." />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-mono text-gray-500">Private Key</label>
                                                <input type="password" value={newKey} onChange={e => setNewKey(e.target.value)}
                                                    className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 font-mono text-sm focus:border-[#0052FF] outline-none"
                                                    placeholder="0x..." />
                                                <p className="text-[10px] text-amber-600 flex items-center gap-1">
                                                    <AlertTriangle className="w-3 h-3" /> Stored locally on this device only
                                                </p>
                                            </div>
                                            <div className="flex gap-2 pt-1">
                                                <CLIButton variant="ghost" onClick={() => { setIsAddingMode(false); setNewKey(''); setNewLabel(''); }} className="flex-1">Cancel</CLIButton>
                                                <CLIButton variant="primary" onClick={handleAddWallet} loading={isDeriving} className="flex-1">Save Wallet</CLIButton>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Wallet List */}
                            <div className="space-y-3">
                                {wallets.length === 0 ? (
                                    <div className="p-10 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl flex flex-col items-center justify-center text-center">
                                        <div className="w-14 h-14 bg-gray-100 dark:bg-gray-900 rounded-full flex items-center justify-center mb-3">
                                            <Wallet className="w-7 h-7 text-gray-400" />
                                        </div>
                                        <p className="text-sm font-bold text-gray-600 dark:text-gray-300">No wallets saved</p>
                                        <p className="text-xs text-gray-400 max-w-[200px] mt-1">Add a deployer wallet to avoid re-entering your private key on each deployment.</p>
                                        <button onClick={() => setIsAddingMode(true)}
                                            className="mt-4 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-[#0052FF] text-[#0052FF] rounded-lg text-xs font-mono font-medium transition-all">
                                            + Add First Wallet
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {wallets.map(wallet => (
                                            <motion.div key={wallet.address} layout
                                                onClick={() => handleSetActive(wallet.address)}
                                                className={`group relative p-4 rounded-xl border cursor-pointer transition-all ${activeWalletAddress === wallet.address
                                                    ? 'bg-white dark:bg-gray-900 border-[#0052FF] shadow-md shadow-[#0052FF]/5 ring-1 ring-[#0052FF]/30'
                                                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'}`}>

                                                {/* Wallet Header */}
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-bold text-sm ${activeWalletAddress === wallet.address ? 'text-[#0052FF]' : 'text-gray-800 dark:text-gray-200'}`}>
                                                            {wallet.label}
                                                        </span>
                                                        {activeWalletAddress === wallet.address && (
                                                            <span className="px-1.5 py-0.5 rounded-full bg-[#0052FF]/10 text-[#0052FF] text-[8px] font-bold uppercase">Active</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[11px] font-mono font-bold text-emerald-500">
                                                            {balances[wallet.address] ? `${parseFloat(balances[wallet.address]).toFixed(4)} ETH` : '...'}
                                                        </span>
                                                        <button onClick={e => { e.stopPropagation(); fetchWalletBalance(wallet.address); }}
                                                            className="p-1 text-gray-300 hover:text-[#0052FF] transition-colors">
                                                            <RefreshCw className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button onClick={e => { e.stopPropagation(); handleDeleteWallet(wallet.address); }}
                                                            className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Address row */}
                                                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2 mb-2">
                                                    <code className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{wallet.address}</code>
                                                    <button onClick={e => { e.stopPropagation(); copyText(wallet.address, `addr-${wallet.address}`); }}
                                                        className="text-gray-400 hover:text-gray-600 ml-2 shrink-0">
                                                        {copied === `addr-${wallet.address}` ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>

                                                {/* PK row */}
                                                <div className="flex items-center gap-2 px-1">
                                                    <Key className="w-3 h-3 text-gray-400 shrink-0" />
                                                    <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 flex-1 truncate">
                                                        {showKey[wallet.address] ? wallet.privateKey : '••••••••••••••••••••••••••••••••••••••••••••••'}
                                                    </span>
                                                    <button onClick={e => { e.stopPropagation(); setShowKey(p => ({ ...p, [wallet.address]: !p[wallet.address] })); }}
                                                        className="text-gray-400 hover:text-gray-600 shrink-0">
                                                        {showKey[wallet.address] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                    </button>
                                                    {showKey[wallet.address] && (
                                                        <button onClick={e => { e.stopPropagation(); copyText(wallet.privateKey, `pk-${wallet.address}`); }}
                                                            className="text-gray-400 hover:text-gray-600 shrink-0">
                                                            {copied === `pk-${wallet.address}` ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                                        </button>
                                                    )}
                                                </div>
                                            </motion.div>
                                        ))}

                                        {/* Add more button */}
                                        <button onClick={() => setIsAddingMode(true)}
                                            className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl text-xs font-mono text-gray-400 hover:border-[#0052FF] hover:text-[#0052FF] transition-all flex items-center justify-center gap-2">
                                            <Plus className="w-3.5 h-3.5" /> Add Another Wallet
                                        </button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ── TAB: BANKR BURNER LOG ──────────────────────────────────────── */}
                    {tab === 'bankr' && (
                        <motion.div key="bankr" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                            className="space-y-4">

                            {/* Info Banner */}
                            <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30 flex gap-2 items-start">
                                <Zap className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                                <div className="text-xs text-orange-700 dark:text-orange-300 space-y-1">
                                    <p>Each Bankr launch uses a <strong>disposable burner wallet</strong>. Funds are tracked securely in the database to ensure zero-loss recovery.</p>
                                    <p className="text-orange-500 dark:text-orange-400">The list below shows all detected burners with residual balances.</p>
                                </div>
                            </div>

                            {/* Global Recovery Component (Turso Backed) */}
                            <div className="space-y-4">
                                <h3 className="font-mono text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">Global Recovery History</h3>
                                <RecoveryManager address={activeWalletAddress || ''} onRecovered={() => { }} />
                            </div>

                            {/* Local Burner Log (Legacy UI) */}
                            <div className="mt-8 pt-8 border-t border-gray-100 dark:border-gray-800 space-y-4">
                                <h3 className="font-mono text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">Device-Specific Log</h3>

                                {/* Log Header */}
                                {burnerLog.length > 0 && (
                                    <div className="flex items-center justify-between">
                                        <p className="font-mono text-[10px] text-gray-400 uppercase tracking-wider">{burnerLog.length} Burner Wallet{burnerLog.length !== 1 ? 's' : ''} Logged</p>
                                        <button onClick={clearSweptEntries}
                                            className="text-[10px] font-mono text-gray-400 hover:text-red-500 transition-colors">
                                            Clear Swept
                                        </button>
                                    </div>
                                )}

                                {/* Burner Log List */}
                                {burnerLog.length === 0 ? (
                                    <div className="p-10 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl flex flex-col items-center justify-center text-center">
                                        <div className="w-14 h-14 bg-orange-50 dark:bg-orange-900/10 rounded-full flex items-center justify-center mb-3">
                                            <Zap className="w-7 h-7 text-orange-300" />
                                        </div>
                                        <p className="text-sm font-bold text-gray-600 dark:text-gray-300">No burner wallets logged</p>
                                        <p className="text-xs text-gray-400 max-w-[220px] mt-1">Every Bankr launch will appear here. Entries are cleared once sweep is confirmed.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {[...burnerLog].reverse().map(entry => {
                                            const bBal = burnerBalances[entry.id];
                                            const isExpanded = expandedEntry === entry.id;

                                            return (
                                                <motion.div key={entry.id} layout
                                                    className={`bg-white dark:bg-gray-900 rounded-xl border overflow-hidden shadow-sm transition-colors ${entry.sweepStatus === 'failed' ? 'border-red-200 dark:border-red-900/50' : entry.sweepStatus === 'pending' ? 'border-yellow-200 dark:border-yellow-900/30' : 'border-gray-200 dark:border-gray-800'}`}>

                                                    {/* Entry Header */}
                                                    <button className="w-full p-4 flex items-start justify-between gap-3"
                                                        onClick={() => {
                                                            setExpandedEntry(isExpanded ? null : entry.id);
                                                            if (!isExpanded && !bBal) fetchBurnerBalance(entry);
                                                        }}>
                                                        <div className="text-left space-y-1.5 flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-mono font-bold text-xs text-gray-800 dark:text-gray-200">${entry.symbol}</span>
                                                                {getSweepBadge(entry.sweepStatus)}
                                                            </div>
                                                            <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                                                <Clock className="w-3 h-3" />
                                                                {ago(entry.timestamp)}
                                                            </div>
                                                        </div>
                                                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform shrink-0 mt-1 ${isExpanded ? 'rotate-90' : ''}`} />
                                                    </button>

                                                    {/* Expanded Details */}
                                                    <AnimatePresence>
                                                        {isExpanded && (
                                                            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                                                                className="overflow-hidden border-t border-gray-100 dark:border-gray-800">
                                                                <div className="p-4 space-y-3">

                                                                    {/* Address */}
                                                                    <div>
                                                                        <p className="text-[10px] font-mono text-gray-400 uppercase mb-1">Burner Address</p>
                                                                        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
                                                                            <code className="text-[11px] font-mono text-gray-600 dark:text-gray-300 flex-1 truncate">{entry.address}</code>
                                                                            <button onClick={() => copyText(entry.address, `burner-${entry.id}`)}>
                                                                                {copied === `burner-${entry.id}` ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
                                                                            </button>
                                                                            <a href={`https://basescan.org/address/${entry.address}`} target="_blank" rel="noopener noreferrer"
                                                                                className="text-gray-400 hover:text-[#0052FF] transition-colors">
                                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                                            </a>
                                                                        </div>
                                                                    </div>

                                                                    {/* Tx Hash */}
                                                                    {entry.txHash && (
                                                                        <div>
                                                                            <p className="text-[10px] font-mono text-gray-400 uppercase mb-1">Deployment Tx</p>
                                                                            <a href={`https://basescan.org/tx/${entry.txHash}`} target="_blank" rel="noopener noreferrer"
                                                                                className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors group">
                                                                                <code className="text-[11px] font-mono text-gray-600 dark:text-gray-300 flex-1 truncate">{entry.txHash}</code>
                                                                                <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-orange-500 transition-colors shrink-0" />
                                                                            </a>
                                                                        </div>
                                                                    )}

                                                                    {/* Balance */}
                                                                    <div>
                                                                        <div className="flex items-center justify-between mb-1">
                                                                            <p className="text-[10px] font-mono text-gray-400 uppercase">Current Balance</p>
                                                                            <button onClick={() => fetchBurnerBalance(entry)}
                                                                                className={`text-[10px] font-mono text-[#0052FF] flex items-center gap-1 ${fetchingBalance[entry.id] ? 'opacity-50' : ''}`}
                                                                                disabled={fetchingBalance[entry.id]}>
                                                                                <RefreshCw className={`w-3 h-3 ${fetchingBalance[entry.id] ? 'animate-spin' : ''}`} />
                                                                                {fetchingBalance[entry.id] ? 'Checking...' : 'Refresh'}
                                                                            </button>
                                                                        </div>

                                                                        {bBal ? (
                                                                            <div className="grid grid-cols-2 gap-2">
                                                                                <div className={`p-3 rounded-xl border text-center ${parseFloat(bBal.eth) > 0.000001 ? 'border-orange-200 dark:border-orange-900/30 bg-orange-50 dark:bg-orange-900/10' : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50'}`}>
                                                                                    <p className="text-[10px] text-gray-500 mb-1">ETH</p>
                                                                                    <p className={`font-mono font-bold text-sm ${parseFloat(bBal.eth) > 0.000001 ? 'text-orange-600' : 'text-gray-400'}`}>
                                                                                        {parseFloat(bBal.eth).toFixed(6)}
                                                                                    </p>
                                                                                </div>
                                                                                <div className={`p-3 rounded-xl border text-center ${parseFloat(bBal.usdc) > 0.01 ? 'border-orange-200 dark:border-orange-900/30 bg-orange-50 dark:bg-orange-900/10' : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50'}`}>
                                                                                    <p className="text-[10px] text-gray-500 mb-1">USDC</p>
                                                                                    <p className={`font-mono font-bold text-sm ${parseFloat(bBal.usdc) > 0.01 ? 'text-green-600' : 'text-gray-400'}`}>
                                                                                        ${bBal.usdc}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 text-center">
                                                                                <p className="text-xs text-gray-400 font-mono">Click Refresh to check balance</p>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Rescue / Sweep action */}
                                                                    {entry.sweepStatus !== 'swept' && (
                                                                        <div className="space-y-2">
                                                                            {entry.burnerPrivateKey ? (
                                                                                <button
                                                                                    onClick={() => handleManualSweep(entry)}
                                                                                    disabled={sweeping[entry.id]}
                                                                                    className={`w-full py-3 rounded-xl font-bold text-xs font-mono flex items-center justify-center gap-2 transition-all ${sweeping[entry.id]
                                                                                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                                                                                        : 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 active:scale-[0.98]'}`}>
                                                                                    <LifeBuoy className={`w-4 h-4 ${sweeping[entry.id] ? 'animate-spin' : ''}`} />
                                                                                    {sweeping[entry.id] ? 'Sweeping...' : 'Rescue Funds → My Wallet'}
                                                                                </button>
                                                                            ) : (
                                                                                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30">
                                                                                    <p className="text-[10px] font-mono text-amber-700 dark:text-amber-400 flex items-start gap-2">
                                                                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                                                        No private key stored. If balance &gt; 0, contact support with the burner address and we will manually sweep it.
                                                                                    </p>
                                                                                    <a href={`https://basescan.org/address/${entry.address}`} target="_blank"
                                                                                        className="mt-2 text-[10px] font-mono text-[#0052FF] flex items-center gap-1">
                                                                                        View on BaseScan <ExternalLink className="w-3 h-3" />
                                                                                    </a>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}

                                                                    {entry.sweepStatus === 'swept' && (
                                                                        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 font-mono">
                                                                            <CheckCircle2 className="w-4 h-4" />
                                                                            Funds successfully swept back to main wallet.
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main >
        </div >
    );
}
