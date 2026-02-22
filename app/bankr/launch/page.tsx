'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Rocket, Check, AlertTriangle, ChevronDown, ChevronUp,
    Shield, Zap, Copy, ExternalLink, Clipboard, Globe,
    Settings, User, Coins, RefreshCw
} from 'lucide-react';
import { useTelegramContext } from '@/components/layout/TelegramProvider';
import { useWallet } from '@/contexts/WalletContext';
import { showBackButton, hideBackButton, hapticFeedback } from '@/lib/telegram/webapp';
import { Terminal, TerminalLine, TerminalLoader } from '@/components/ui/Terminal';
import { RecoveryManager } from '@/components/ui/RecoveryManager';
import { CLIButton, CLICard, CLIInput, StatusBadge } from '@/components/ui/CLIButton';
import { shortenAddress } from '@/lib/utils';
import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';

// USDC on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
const ERC20_BALANCE_ABI = [{
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
}] as const;

// ─── Types ─────────────────────────────────────────────────────────────────────
type BankrStep = 'form' | 'review' | 'deploying' | 'success' | 'error';
type FeeType = 'x' | 'farcaster' | 'ens' | 'wallet';
type TaxType = 'dynamic' | 'static';

interface BankrConfig {
    name: string;
    symbol: string;
    image: string;
    description: string;
    tweet: string;
    cast: string;
    website: string;
    launcherType: FeeType;
    launcher: string;
    dashboardFeeType: FeeType;
    dashboardFee: string;
    taxType: TaxType;
    taxPercentage: number;
    rewardRecipient: string;
    vanityEnabled: boolean;
    vanitySuffix: string;   // fixed default, not user-editable (simplified)
}

const DEFAULT_VANITY_SUFFIX = 'bA3';

const DEFAULT_CONFIG: BankrConfig = {
    name: '', symbol: '', image: '', description: '',
    tweet: '', cast: '', website: '',
    launcherType: 'x', launcher: '',
    dashboardFeeType: 'x', dashboardFee: '',
    taxType: 'static', taxPercentage: 5,
    rewardRecipient: '',
    vanityEnabled: false, vanitySuffix: DEFAULT_VANITY_SUFFIX,
};

const STORAGE_KEY = 'bankr_launch_v3';

// ─── Sub-Components ─────────────────────────────────────────────────────────────

function MobileInput({
    label, value, onChange, placeholder, error, multiline = false, uppercase = false, hint, agentId,
}: {
    label: string; value: string; onChange: (v: string) => void;
    placeholder: string; error?: string; multiline?: boolean;
    uppercase?: boolean; hint?: string; agentId?: string;
}) {
    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                onChange(uppercase ? text.toUpperCase() : text.trim());
                hapticFeedback('success');
            }
        } catch (e) {
            console.warn('Paste failed', e);
        }
    };

    const cls = `w-full bg-slate-50/50 dark:bg-gray-900 border ${error ? 'border-red-300 dark:border-red-500/50' : 'border-gray-100 dark:border-gray-800'} rounded-xl px-4 py-3 font-mono text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/ transition-all shadow-sm`;

    return (
        <div className="space-y-1.5">
            {label && (
                <div className="flex items-center justify-between px-1">
                    <label className="block font-mono text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-bold">
                        {label}
                    </label>
                    <button type="button" onClick={handlePaste}
                        className="font-mono text-[9px] text-orange-500/70 hover:text-orange-500 font-bold uppercase tracking-tighter flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded-md hover:bg-orange-500/5">
                        <Clipboard className="w-2.5 h-2.5" /> Paste
                    </button>
                </div>
            )}
            <div className="relative">
                {multiline ? (
                    <textarea value={value} onChange={(e) => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
                        placeholder={placeholder} rows={2} className={cls + ' resize-none'}
                        {...(agentId && { 'data-agent': agentId })} />
                ) : (
                    <input type="text" value={value} onChange={(e) => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
                        placeholder={placeholder} className={cls}
                        {...(agentId && { 'data-agent': agentId })} />
                )}
            </div>
            {hint && !error && <p className="px-1 font-mono text-[9px] text-gray-400/80 dark:text-gray-500/80 leading-tight italic">{hint}</p>}
            {error && <p className="px-1 font-mono text-[10px] text-red-500 font-medium">✗ {error}</p>}
        </div>
    );
}

function OptionSelector({
    label, value, options, onChange, descriptions,
}: {
    label: string; value: string; options: string[];
    onChange: (v: string) => void; descriptions?: Record<string, string>;
}) {
    return (
        <div className="space-y-2">
            <label className="block font-mono text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 font-bold">{label}</label>
            <div className="grid grid-cols-2 gap-2">
                {options.map((opt) => (
                    <button key={opt} type="button"
                        onClick={() => { onChange(opt); hapticFeedback('light'); }}
                        className={`p-2.5 rounded-xl border font-mono text-xs text-left transition-all relative overflow-hidden ${value === opt
                            ? 'border-orange-500 bg-orange-500/5 ring-1 ring-orange-500/20'
                            : 'border-gray-100 dark:border-gray-800 bg-slate-50/30 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400 hover:border-gray-200 dark:hover:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-900/60'}`}>
                        {value === opt && (
                            <div className="absolute top-1 right-1">
                                <Check className="w-3 h-3 text-orange-500" />
                            </div>
                        )}
                        <div className={`text-xs font-bold leading-none ${value === opt ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'}`}>{opt.toUpperCase()}</div>
                        {descriptions?.[opt] && <div className="text-[9px] text-gray-400 dark:text-gray-500 mt-1 leading-tight">{descriptions[opt]}</div>}
                    </button>
                ))}
            </div>
        </div>
    );
}

function CollapsibleSection({
    title, icon: Icon, children, defaultOpen = false,
}: {
    title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden bg-white/50 dark:bg-gray-900/20 backdrop-blur-sm">
            <button type="button" onClick={() => { setIsOpen(!isOpen); hapticFeedback('light'); }}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-3 text-gray-500 dark:text-gray-400">
                    <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                        <Icon className="w-3.5 h-3.5 text-orange-500" />
                    </div>
                    {title}
                </span>
                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-4 pb-4 space-y-5 border-t border-gray-50 dark:border-gray-800">
                            <div className="pt-4 space-y-5">
                                {children}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Simple animated toggle pill
function TogglePill({ checked, onChange }: { checked: boolean; onChange: () => void }) {
    return (
        <button type="button" onClick={() => { onChange(); hapticFeedback('medium'); }}
            className={`w-12 h-6 rounded-full transition-all duration-300 relative flex-shrink-0 ${checked ? 'bg-purple-600 shadow-md shadow-purple-500/30' : 'bg-gray-200 dark:bg-gray-700'}`}>
            <motion.div
                layout
                transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm ${checked ? 'left-6' : 'left-0.5'}`}
            />
        </button>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function BankrLaunchPage() {
    const router = useRouter();
    const { isAuthenticated, formattedAddress, address, balance, refreshBalance } = useWallet();
    const { isTelegram } = useTelegramContext();

    const [step, setStep] = useState<BankrStep>('form');
    const [config, setConfig] = useState<BankrConfig>(DEFAULT_CONFIG);
    const [isLoaded, setIsLoaded] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [deployLogs, setDeployLogs] = useState<string[]>([]);
    const [deployResult, setDeployResult] = useState<{
        txHash?: string; message?: string; deployedViaFallback?: boolean;
    } | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [isDeploying, setIsDeploying] = useState(false);
    const [isAdvanced, setIsAdvanced] = useState(false);
    const [ethPrice, setEthPrice] = useState<number | null>(null);
    const [usdcBalance, setUsdcBalance] = useState<string | null>(null);

    // Fetch USDC balance for the connected wallet
    const fetchUsdcBalance = useCallback(async (addr: string) => {
        try {
            const client = createPublicClient({
                chain: base,
                transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
            });
            const raw = await client.readContract({
                address: USDC_ADDRESS,
                abi: ERC20_BALANCE_ABI,
                functionName: 'balanceOf',
                args: [addr as `0x${string}`],
            }) as bigint;
            setUsdcBalance(formatUnits(raw, 6));
        } catch { }
    }, []);

    // Unified Auto-Refresh Logic (Balances & Prices)
    useEffect(() => {
        if (!address) return;

        // Force initial fetches
        fetchUsdcBalance(address);

        const fetchEthPrice = async () => {
            try {
                const r = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot');
                const d = await r.json();
                setEthPrice(parseFloat(d.data.amount));
            } catch { }
        };
        fetchEthPrice();

        // 10s interval for balances
        const balanceInterval = setInterval(() => {
            fetchUsdcBalance(address);
            // Also trigger WalletContext refresh for ETH
            const walletContext = (window as any)._walletContext; // Context-less backup? No, context is already in scope.
            // Wait, I have refreshBalance from useWallet in scope.
        }, 10000);

        // 60s interval for Price
        const priceInterval = setInterval(fetchEthPrice, 60000);

        return () => {
            clearInterval(balanceInterval);
            clearInterval(priceInterval);
        };
    }, [address, fetchUsdcBalance]);

    // Independent effect for ETH refresh trigger (WalletContext already has internal 30s poll, we just speed it up here)
    useEffect(() => {
        if (!address) return;
        const ethPoll = setInterval(() => {
            refreshBalance();
        }, 10000);
        return () => clearInterval(ethPoll);
    }, [address, refreshBalance]);

    // Load from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                // vanitySuffix is no longer user-editable, always use default
                setConfig(prev => ({ ...prev, ...parsed, vanitySuffix: DEFAULT_VANITY_SUFFIX }));
            }
        } catch { }
        setIsLoaded(true);
    }, []);

    // Set default rewardRecipient from wallet
    useEffect(() => {
        if (address) {
            setConfig(prev => ({
                ...prev,
                rewardRecipient: prev.rewardRecipient || address,
            }));
        }
    }, [address]);

    // Save to localStorage (only config fields, not transient state)
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        }
    }, [config, isLoaded]);

    // ── Telegram back button ──
    // Back goes to home (/) not to /bankr agent chat page to prevent accidental fallback chat
    useEffect(() => {
        if (isTelegram) {
            const destination = step === 'form' ? '/' : undefined;
            if (destination) {
                showBackButton(() => router.push(destination));
            } else {
                // During deploying/review/success/error: disable back button to prevent interruption
                hideBackButton();
            }
            return () => hideBackButton();
        }
    }, [isTelegram, router, step]);

    const getPlaceholder = (type: FeeType) => {
        switch (type) {
            case 'x': return '@username';
            case 'farcaster': return '@handle';
            case 'ens': return 'vitalik.eth';
            case 'wallet': return '0x...';
        }
    };

    const addLog = useCallback((msg: string) => {
        setDeployLogs(prev => [...prev, msg]);
    }, []);

    const copyField = async (text: string, field: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(field);
            hapticFeedback('success');
            setTimeout(() => setCopiedField(null), 2000);
        } catch { }
    };

    const validateForm = useCallback((): boolean => {
        const errs: Record<string, string> = {};
        if (!config.name.trim()) errs.name = 'Required';
        if (!config.symbol.trim()) errs.symbol = 'Required';
        if (!config.launcher.trim()) errs.launcher = 'Launcher handle is required';
        if (!config.dashboardFee.trim()) errs.dashboardFee = 'Fee recipient is required';
        if (!config.rewardRecipient || !/^0x[a-fA-F0-9]{40}$/i.test(config.rewardRecipient)) {
            errs.rewardRecipient = 'Valid EVM address required';
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    }, [config]);

    const handleReview = () => {
        if (!validateForm()) { hapticFeedback('error'); return; }
        hapticFeedback('medium');
        setStep('review');
    };

    const handleDeploy = async () => {
        if (isDeploying) return;
        setIsDeploying(true);
        setStep('deploying');
        setDeployLogs([]);

        addLog('Initializing Bankr AI Agent...');
        addLog(`Token: ${config.name} ($${config.symbol.toUpperCase()})`);
        addLog(`Launcher: ${config.launcherType}:${config.launcher}`);
        addLog(`Fee → ${config.dashboardFeeType}:${config.dashboardFee}`);
        addLog(`Tax: ${config.taxType.toUpperCase()}${config.taxType === 'static' ? ` (${config.taxPercentage}%)` : ''}`);
        if (config.vanityEnabled) addLog(`Vanity suffix: ...${DEFAULT_VANITY_SUFFIX}`);
        addLog('Preparing signing wallet...');
        await new Promise(r => setTimeout(r, 600));
        addLog('Funding from main wallet...');
        await new Promise(r => setTimeout(r, 400));
        addLog('Connecting x402 payment channel...');

        try {
            // Read autoSweep from global prefs — Settings is the single source of truth
            let autoSweep = true;
            try {
                const prefs = JSON.parse(localStorage.getItem('clanker_prefs') || '{}');
                if (prefs.autoSweep !== undefined) autoSweep = prefs.autoSweep;
            } catch { }

            const response = await fetch('/api/bankr/launch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: config.name.trim(),
                    symbol: config.symbol.toUpperCase().trim(),
                    image: config.image || undefined,
                    description: config.description || undefined,
                    tweet: config.tweet || undefined,
                    cast: config.cast || undefined,
                    website: config.website || undefined,
                    launcherType: config.launcherType,
                    launcher: config.launcher,
                    dashboardFeeType: config.dashboardFeeType,
                    dashboardFee: config.dashboardFee,
                    taxType: config.taxType,
                    taxPercentage: config.taxPercentage,
                    rewardRecipient: config.rewardRecipient,
                    vanityEnabled: config.vanityEnabled,
                    vanitySuffix: config.vanityEnabled ? DEFAULT_VANITY_SUFFIX : undefined,
                    autoSweep,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Bankr launch failed – check your settings');
            }

            addLog(`TX: ${data.txHash ? data.txHash.slice(0, 14) : '(pending)'}...`);
            addLog(`✓ ${data.deployedViaFallback ? 'Deployed via Clanker SDK Fallback' : 'Bankr Agent succeeded'}`);
            addLog('✓ Confirmed on Base!');

            // Persist burner log entry for Wallet Management page
            try {
                const logKey = 'bankr_burner_log';
                const existing = JSON.parse(localStorage.getItem(logKey) || '[]');
                const entry = {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    address: data.burnerAddress || 'unknown',
                    symbol: config.symbol.toUpperCase(),
                    timestamp: Date.now(),
                    txHash: data.txHash,
                    sweepStatus: autoSweep ? 'swept' : 'pending',
                };
                const updated = [...existing, entry].slice(-20); // keep last 20
                localStorage.setItem(logKey, JSON.stringify(updated));
            } catch { }

            setDeployResult(data);
            hapticFeedback('success');
            setStep('success');

        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            addLog(`✗ Error: ${msg}`);
            hapticFeedback('error');
            setStep('error');
        } finally {
            setIsDeploying(false);
        }
    };

    const resetForm = () => {
        setStep('form');
        setConfig({ ...DEFAULT_CONFIG, rewardRecipient: address || '' });
        setErrors({});
        setDeployLogs([]);
        setDeployResult(null);
    };

    const deployAnother = () => {
        setStep('form');
        setConfig(prev => ({ ...prev, name: '', symbol: '', image: '', description: '', tweet: '', cast: '' }));
        setErrors({});
        setDeployLogs([]);
        setDeployResult(null);
    };

    const formatBalance = (bal: string | null) => {
        if (!bal) return '...';
        const eth = parseFloat(bal);
        if (ethPrice) return `${eth.toFixed(4)} ETH (~$${(eth * ethPrice).toFixed(2)})`;
        return `${eth.toFixed(4)} ETH`;
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4">
                <Terminal title="bankr@base:~/launch">
                    <TerminalLine text="Error: Wallet not connected" type="error" />
                    <div className="mt-6">
                        <CLIButton variant="primary" onClick={() => router.push('/')} fullWidth>Go to Terminal</CLIButton>
                    </div>
                </Terminal>
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] flex flex-col relative overflow-hidden transition-colors bg-gradient-to-br from-white via-orange-50/20 to-white dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">

            {/* Ambient glow */}
            <div className="absolute -top-20 -right-20 w-80 h-80 bg-orange-500/5 dark:bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

            <header className="relative z-10 px-3 sm:px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between border-b border-gray-100/80 dark:border-gray-800/80 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    {!isTelegram && (
                        <motion.button whileTap={{ scale: 0.95 }} onClick={() => router.push('/')}
                            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
                            <ArrowLeft className="w-5 h-5" />
                        </motion.button>
                    )}
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                            <Rocket className="w-4 h-4 text-orange-500" />
                        </div>
                        <div>
                            <h1 className="font-display font-bold text-gray-800 dark:text-gray-100 text-sm sm:text-base">Bankr Launch</h1>
                            <p className="font-mono text-[10px] text-gray-500 dark:text-gray-400">AI Agent · x402 Protocol</p>
                        </div>
                    </div>
                </div>
                <StatusBadge status="online" text={formattedAddress || ''} />
            </header>

            {/* Main */}
            <main className="flex-1 p-3 relative z-10 overflow-y-auto">
                <div className="max-w-lg mx-auto">
                    <AnimatePresence mode="wait">

                        {/* ─── FORM ──────────────────────────────────────────────────────── */}
                        {step === 'form' && (
                            <motion.div key="form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                                <Terminal title="Token Launch Configuration" className="w-full">

                                    {/* Balance chips - Unified Currency Pane */}
                                    <div className="mb-5 flex flex-col sm:flex-row items-stretch gap-2">
                                        <div className="flex-1 flex gap-2">
                                            {/* ETH Balance */}
                                            <div className="flex-1 px-3.5 py-3 rounded-2xl bg-orange-50/50 dark:bg-orange-500/5 border border-orange-100 dark:border-orange-500/10 flex items-center justify-between min-w-0 transition-all hover:bg-orange-50 dark:hover:bg-orange-500/10 group">
                                                <div className="flex flex-col">
                                                    <span className="font-mono text-[9px] text-orange-600/60 dark:text-orange-400/60 uppercase tracking-widest font-bold">ETH Balance</span>
                                                    <div className="flex items-baseline gap-1.5">
                                                        <span className="font-mono text-sm text-orange-600 dark:text-orange-400 font-bold truncate">
                                                            {balance ? parseFloat(balance).toFixed(4) : '0.0000'}
                                                        </span>
                                                        <span className="text-[10px] text-orange-400/50 dark:text-orange-500/30">ETH</span>
                                                    </div>
                                                </div>
                                                {balance && ethPrice && (
                                                    <div className="text-right flex flex-col items-end">
                                                        <span className="font-mono text-[10px] text-orange-500/70 dark:text-orange-400/50 font-medium">
                                                            ${(parseFloat(balance) * ethPrice).toFixed(2)}
                                                        </span>
                                                        <div className="w-1 h-1 rounded-full bg-orange-400/40 animate-pulse mt-1" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* USDC Balance */}
                                            <div className={`flex-1 px-3.5 py-3 rounded-2xl border flex items-center justify-between min-w-0 transition-all group ${usdcBalance === null
                                                ? 'bg-gray-50/50 dark:bg-gray-800/20 border-gray-100 dark:border-gray-800'
                                                : parseFloat(usdcBalance) >= 0.10
                                                    ? 'bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-100 dark:border-emerald-500/10 hover:bg-emerald-50'
                                                    : 'bg-red-50/50 dark:bg-red-500/5 border-red-100 dark:border-red-500/10 hover:bg-red-50'
                                                }`}>
                                                <div className="flex flex-col">
                                                    <span className={`font-mono text-[9px] uppercase tracking-widest font-bold ${usdcBalance === null ? 'text-gray-400 dark:text-gray-500'
                                                        : parseFloat(usdcBalance) >= 0.10 ? 'text-emerald-600/60 dark:text-emerald-400/60'
                                                            : 'text-red-500/60 dark:text-red-400/60'
                                                        }`}>USDC Wallet</span>
                                                    <div className="flex items-baseline gap-1">
                                                        <span className={`font-mono text-sm font-bold truncate ${usdcBalance === null ? 'text-gray-300 dark:text-gray-600'
                                                            : parseFloat(usdcBalance) >= 0.10 ? 'text-emerald-700 dark:text-emerald-400'
                                                                : 'text-red-600 dark:text-red-400'
                                                            }`}>
                                                            {usdcBalance === null ? '0.00' : `${parseFloat(usdcBalance).toFixed(2)}`}
                                                        </span>
                                                        <span className="text-[10px] opacity-30">$</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    {usdcBalance !== null && parseFloat(usdcBalance) < 0.10 ? (
                                                        <span className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold uppercase tracking-tighter">Auto-Swap</span>
                                                    ) : (
                                                        <div className="w-1 h-1 rounded-full bg-emerald-400/40 animate-pulse mt-1" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <button type="button" onClick={() => { setIsAdvanced(!isAdvanced); hapticFeedback('light'); }}
                                            className={`p-3 rounded-2xl border flex items-center justify-center gap-2 transition-all shadow-sm ${isAdvanced
                                                ? 'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600 text-gray-800 dark:text-white'
                                                : 'bg-white border-gray-100 dark:bg-gray-900 dark:border-gray-800 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/60'}`}>
                                            <Settings className={`w-4 h-4 ${isAdvanced ? 'animate-spin-slow' : ''}`} />
                                            <span className="font-mono text-[10px] font-bold tracking-widest">{isAdvanced ? 'ADVANCED' : 'BASIC'}</span>
                                        </button>
                                    </div>

                                    {/* ── Basic Token Info */}
                                    <div className="space-y-4 mb-4">
                                        <div className="flex gap-4">
                                            <div className="flex-1">
                                                <MobileInput label="name" value={config.name}
                                                    onChange={v => setConfig(p => ({ ...p, name: v }))}
                                                    placeholder="My Token" error={errors.name} agentId="bankr-name-input" />
                                            </div>
                                            <div className="w-1/3">
                                                <MobileInput label="symbol" value={config.symbol}
                                                    onChange={v => setConfig(p => ({ ...p, symbol: v }))}
                                                    placeholder="TKN" uppercase error={errors.symbol} agentId="bankr-symbol-input" />
                                            </div>
                                        </div>

                                        <MobileInput label="description" value={config.description}
                                            onChange={v => setConfig(p => ({ ...p, description: v }))}
                                            placeholder="Token description..." multiline hint="Optional – shown on Bankr/Clanker" />

                                        <MobileInput label="image" value={config.image}
                                            onChange={v => setConfig(p => ({ ...p, image: v }))}
                                            placeholder="CID or https://..." hint="IPFS CID or direct URL" />

                                        {config.image && (
                                            <div className="flex gap-3 items-center p-2 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                                                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 shrink-0">
                                                    <img
                                                        src={config.image.startsWith('ipfs://')
                                                            ? `https://gateway.pinata.cloud/ipfs/${config.image.replace('ipfs://', '')}`
                                                            : config.image}
                                                        alt="preview" className="w-full h-full object-cover"
                                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                                </div>
                                                <p className="font-mono text-[10px] text-gray-500 truncate max-w-[220px]">{config.image}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* ── Collapsible Sections */}
                                    <div className="space-y-3">

                                        {/* Social Links */}
                                        <CollapsibleSection title="Social Links (Optional)" icon={Globe}>
                                            <div className="grid grid-cols-1 gap-3">
                                                <MobileInput label="tweet" value={config.tweet}
                                                    onChange={v => setConfig(p => ({ ...p, tweet: v }))} placeholder="https://x.com/..." />
                                                <MobileInput label="cast" value={config.cast}
                                                    onChange={v => setConfig(p => ({ ...p, cast: v }))} placeholder="https://warpcast.com/..." />
                                                <MobileInput label="website" value={config.website}
                                                    onChange={v => setConfig(p => ({ ...p, website: v }))} placeholder="https://..." />
                                            </div>
                                        </CollapsibleSection>

                                        {/* Dashboard LAUNCHER identity */}
                                        <CollapsibleSection title="Dashboard LAUNCHER" icon={User} defaultOpen>
                                            <div className="space-y-4">
                                                <div className="p-2.5 rounded-lg bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
                                                    <p className="font-mono text-[10px] text-blue-600 dark:text-blue-400">
                                                        👁 Shown as <strong>LAUNCHER</strong> on bankr.bot/launches. Can be <em>any</em> X/Farcaster/ENS/wallet handle — does not need to match the deploying wallet.
                                                    </p>
                                                </div>
                                                <OptionSelector label="Identity Type" value={config.launcherType}
                                                    options={['x', 'farcaster', 'ens', 'wallet']}
                                                    onChange={v => setConfig(p => ({ ...p, launcherType: v as FeeType }))}
                                                    descriptions={{ x: 'Twitter/X handle', farcaster: 'Farcaster handle', ens: 'ENS domain', wallet: 'EVM address' }} />
                                                <MobileInput label="launcher_handle" value={config.launcher}
                                                    onChange={v => setConfig(p => ({ ...p, launcher: v }))}
                                                    placeholder={getPlaceholder(config.launcherType)} error={errors.launcher}
                                                    hint={`Appears as the public launcher identity on bankr.bot`} agentId="bankr-launcher-input" />
                                            </div>
                                        </CollapsibleSection>


                                        {/* Dashboard FEE TO + Tax + On-chain routing */}
                                        <CollapsibleSection title="FEE TO & On-Chain Routing" icon={Coins} defaultOpen>
                                            <div className="space-y-4">
                                                <div className="p-2.5 rounded-lg bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
                                                    <p className="font-mono text-[10px] text-blue-600 dark:text-blue-400">
                                                        👁 <strong>FEE TO</strong> is the display handle on bankr.bot. The actual on-chain fees always go to your <strong>Wallet Address</strong> below.
                                                    </p>
                                                </div>
                                                <OptionSelector label="FEE TO Display Type" value={config.dashboardFeeType}
                                                    options={['x', 'farcaster', 'ens', 'wallet']}
                                                    onChange={v => setConfig(p => ({ ...p, dashboardFeeType: v as FeeType }))}
                                                    descriptions={{ x: 'X identity', farcaster: 'Farcaster', ens: 'ENS name', wallet: 'Direct wallet' }} />
                                                <MobileInput label="fee_to_handle" value={config.dashboardFee}
                                                    onChange={v => setConfig(p => ({ ...p, dashboardFee: v }))}
                                                    placeholder={getPlaceholder(config.dashboardFeeType)} error={errors.dashboardFee}
                                                    hint={`Shown as FEE TO on bankr.bot — display only, fees go to your wallet below`} agentId="bankr-fee-input" />

                                                <OptionSelector label="Tax Mode" value={config.taxType}
                                                    options={['dynamic', 'static']}
                                                    onChange={v => setConfig(p => ({ ...p, taxType: v as TaxType }))}
                                                    descriptions={{ dynamic: 'Auto 1–10%', static: `Fixed ${config.taxPercentage}%` }} />

                                                {config.taxType === 'static' && (
                                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-1 px-1">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-xs font-mono text-gray-500">Static Tax %</span>
                                                            <span className="text-xs font-mono font-bold text-orange-500">{config.taxPercentage}%</span>
                                                        </div>
                                                        <input type="range" min="0" max="90" step="0.5"
                                                            value={config.taxPercentage}
                                                            onChange={e => setConfig(p => ({ ...p, taxPercentage: parseFloat(e.target.value) }))}
                                                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-orange-500" />
                                                    </motion.div>
                                                )}

                                                <MobileInput label="wallet_address" value={config.rewardRecipient}
                                                    onChange={v => setConfig(p => ({ ...p, rewardRecipient: v }))}
                                                    placeholder={address || '0x...'} error={errors.rewardRecipient}
                                                    hint="Your EVM wallet — all on-chain fee revenue is paid here" />
                                            </div>
                                        </CollapsibleSection>


                                        {/* Advanced: Vanity only (simple toggle) */}
                                        <AnimatePresence>
                                            {isAdvanced && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }} className="overflow-hidden">

                                                    {/* Vanity Address Toggle - SIMPLIFIED */}
                                                    <div className="p-3.5 rounded-2xl border border-purple-100 dark:border-purple-900/30 bg-purple-50/10 dark:bg-purple-900/5 flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-900/30">
                                                                <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                                            </div>
                                                            <div>
                                                                <h4 className="font-mono text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">VANITY ADDR</h4>
                                                                <p className="text-xs font-bold text-purple-600 dark:text-purple-400">
                                                                    Ends in ...{DEFAULT_VANITY_SUFFIX}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <TogglePill
                                                            checked={config.vanityEnabled}
                                                            onChange={() => setConfig(p => ({ ...p, vanityEnabled: !p.vanityEnabled }))}
                                                        />
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* CTA */}
                                    <div className="flex gap-3 mt-6">
                                        <CLIButton variant="ghost" onClick={() => router.push('/')} agentId="bankr-cancel-button">Cancel</CLIButton>
                                        <CLIButton variant="primary" onClick={handleReview} fullWidth
                                            icon={<Rocket className="w-4 h-4" />}
                                            className="!bg-orange-500 hover:!bg-orange-600 shadow-lg shadow-orange-500/20"
                                            agentId="bankr-review-button">
                                            Review
                                        </CLIButton>
                                    </div>

                                    {/* Stuck Funds Recovery */}
                                    <RecoveryManager address={address || ''} onRecovered={refreshBalance} />
                                </Terminal>
                            </motion.div>
                        )}
                        {step === 'review' && (
                            <motion.div key="review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                                <Terminal title="Review Launch" className="w-full">
                                    <TerminalLine text="Review your configuration before deployment:" type="command" />
                                    <CLICard className="mt-4 !bg-slate-50/30 dark:!bg-gray-900/60 border-gray-100 dark:border-gray-800 shadow-inner px-0">
                                        <div className="space-y-3 text-sm px-1">
                                            <div className="flex justify-between items-center opacity-90"><span className="font-mono text-[10px] uppercase text-gray-400">Token Name</span><span className="font-bold text-gray-800 dark:text-gray-100">{config.name}</span></div>
                                            <div className="flex justify-between items-center"><span className="font-mono text-[10px] uppercase text-gray-400">Symbol</span><span className="text-orange-500 font-bold px-2 py-0.5 rounded-lg bg-orange-500/5 border border-orange-500/10">${config.symbol.toUpperCase()}</span></div>
                                            {config.description && <div className="flex justify-between items-start gap-4"><span className="font-mono text-[10px] uppercase text-gray-400">Bio</span><span className="text-xs text-right italic text-gray-600 dark:text-gray-400 truncate max-w-[180px]">{config.description}</span></div>}

                                            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2 mt-1">
                                                <div className="flex justify-between items-center"><span className="font-mono text-[10px] uppercase text-gray-400">Identity</span><span className="text-[11px] font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{config.launcherType}:{config.launcher}</span></div>
                                                <div className="flex justify-between items-center"><span className="font-mono text-[10px] uppercase text-gray-400">Tax Mode</span><span className="text-[11px] font-mono font-bold text-gray-700 dark:text-gray-300">{config.taxType === 'static' ? `FIXED ${config.taxPercentage}%` : 'DYNAMIC 1-10%'}</span></div>
                                                <div className="flex justify-between items-center"><span className="font-mono text-[10px] uppercase text-gray-400">Payout Wallet</span><span className="text-[10px] font-mono text-gray-500">{shortenAddress(config.rewardRecipient)}</span></div>
                                                {config.vanityEnabled && (
                                                    <div className="flex justify-between items-center"><span className="font-mono text-[10px] uppercase text-purple-400">Vanity Suffix</span><span className="text-purple-500 font-mono text-xs font-bold ring-1 ring-purple-500/20 px-1.5 py-0.5 rounded-md">...{DEFAULT_VANITY_SUFFIX}</span></div>
                                                )}
                                            </div>

                                            <div className="border-t border-dashed border-gray-200 dark:border-gray-800 pt-3 text-xs mt-1">
                                                <div className="flex justify-between items-center font-bold text-orange-600 dark:text-orange-400">
                                                    <div className="flex items-center gap-1.5">
                                                        <Zap className="w-3 h-3" />
                                                        <span className="font-mono text-[10px] uppercase">Est. Cost</span>
                                                    </div>
                                                    <span className="font-mono leading-none tracking-tight">~0.001 ETH + $0.10 USDC</span>
                                                </div>
                                            </div>
                                        </div>
                                    </CLICard>

                                    {/* Low balance warning */}
                                    {balance && parseFloat(balance) < 0.001 && (
                                        <div className="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 flex gap-2 items-start">
                                            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                            <p className="font-mono text-xs text-red-600 dark:text-red-400">
                                                Low balance ({parseFloat(balance).toFixed(4)} ETH). You need at least 0.001 ETH to fund the burner wallet.
                                            </p>
                                        </div>
                                    )}

                                    <div className="flex gap-3 mt-6">
                                        <CLIButton variant="ghost" onClick={() => setStep('form')} agentId="bankr-edit-button">Edit</CLIButton>
                                        <CLIButton variant="primary" onClick={handleDeploy} fullWidth
                                            icon={<Rocket className="w-4 h-4" />} loading={isDeploying}
                                            className="!bg-orange-500 hover:!bg-orange-600 shadow-lg shadow-orange-500/20"
                                            agentId="bankr-confirm-button">
                                            Launch Now
                                        </CLIButton>
                                    </div>
                                </Terminal>
                            </motion.div>
                        )}

                        {/* ─── DEPLOYING ──────────────────────────────────────────────────── */}
                        {step === 'deploying' && (
                            <motion.div key="deploying" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }}
                                className="py-12 flex flex-col items-center w-full">

                                {/* Animated Rocket */}
                                <div className="relative mb-8 flex items-center justify-center">
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                                        className="absolute w-32 h-32 rounded-full border-t-2 border-r-2 border-orange-500 opacity-50 drop-shadow-[0_0_15px_rgba(249,115,22,0.5)]" />
                                    <motion.div animate={{ rotate: -360 }} transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                                        className="absolute w-28 h-28 rounded-full border-b-2 border-l-2 border-amber-400 opacity-60 drop-shadow-[0_0_10px_rgba(251,191,36,0.4)]" />
                                    <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.7, 0.3] }}
                                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                        className="absolute w-20 h-20 rounded-full bg-orange-500/30 blur-xl" />
                                    <div className="w-16 h-16 bg-white dark:bg-gray-900 border border-orange-500/30 rounded-full flex items-center justify-center relative z-10 shadow-[0_0_30px_rgba(249,115,22,0.2)]">
                                        <Rocket className="w-8 h-8 text-orange-500" />
                                    </div>
                                </div>

                                <motion.h2 animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 2, repeat: Infinity }}
                                    className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-amber-500 mb-2 font-display text-center">
                                    Contacting Bankr Agent...
                                </motion.h2>
                                <p className="text-gray-500 mb-8 text-xs font-mono tracking-widest uppercase text-center">x402 Protocol · Base Network</p>

                                {/* Terminal Log */}
                                <div className="w-full bg-black/90 backdrop-blur-xl rounded-xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.3)] border border-orange-900/40 font-mono text-xs max-w-sm relative">
                                    <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
                                        <motion.div animate={{ y: ['-100%', '200%'] }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                                            className="absolute inset-x-0 h-32 bg-gradient-to-b from-transparent via-orange-500/10 to-transparent" />
                                    </div>
                                    <div className="bg-gray-900/80 px-3 py-2 flex items-center gap-2 border-b border-gray-800 relative z-10">
                                        <div className="flex gap-1.5">
                                            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                                            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                                        </div>
                                        <span className="text-gray-500 ml-2">bankr_launch.log</span>
                                    </div>
                                    <div className="p-4 h-56 overflow-y-auto space-y-2 scrollbar-hide text-orange-400 font-mono leading-relaxed relative z-10">
                                        {deployLogs.map((log, i) => (
                                            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={i}
                                                className="break-all border-l-2 border-transparent hover:border-orange-800 pl-2">
                                                <span className="text-gray-600 mr-2 select-none">[{new Date().toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' })}]</span>
                                                {log}
                                            </motion.div>
                                        ))}
                                        <div className="animate-pulse text-orange-500 font-bold">_</div>
                                    </div>
                                </div>
                            </motion.div>
                        )
                        }

                        {/* ─── SUCCESS ────────────────────────────────────────────────────── */}
                        {
                            step === 'success' && deployResult && (
                                <motion.div key="success" initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                    className="py-6 flex flex-col items-center w-full text-center">

                                    <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-xl border-4 border-white dark:border-gray-900 ring-8 ${deployResult.deployedViaFallback ? 'bg-amber-50 ring-amber-500/10' : 'bg-emerald-50 ring-emerald-500/10'}`}>
                                        <div className={`p-4 rounded-full ${deployResult.deployedViaFallback ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
                                            <Check className={`w-10 h-10 ${deployResult.deployedViaFallback ? 'text-amber-600' : 'text-emerald-600'}`} />
                                        </div>
                                    </div>

                                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                        {deployResult.deployedViaFallback ? 'Deployed via Fallback' : 'Mission Accomplished'}
                                    </h2>
                                    <p className="text-gray-500 text-xs mb-8 max-w-[280px] leading-relaxed">
                                        {deployResult.deployedViaFallback
                                            ? 'Bankr Agent was busy. Token successfully deployed via Clanker SDK core.'
                                            : 'Your token is live on Base via Bankr AI Agent protocol.'}
                                    </p>

                                    {deployResult.txHash && (
                                        <div className="w-full bg-white/50 dark:bg-gray-900/40 backdrop-blur-sm rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm mb-6 text-left relative overflow-hidden max-w-sm">
                                            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${deployResult.deployedViaFallback ? 'from-amber-400 to-orange-500' : 'from-emerald-400 to-teal-500'}`} />
                                            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-1.5">Transaction Hash</p>
                                            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700 cursor-pointer group hover:border-orange-200 transition-colors"
                                                onClick={() => copyField(deployResult.txHash!, 'tx')}>
                                                <code className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1 font-mono">{deployResult.txHash}</code>
                                                <div className="text-gray-400 group-hover:text-gray-600">
                                                    {copiedField === 'tx' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                                </div>
                                            </div>
                                            <div className="mt-3">
                                                <a href={`https://basescan.org/tx/${deployResult.txHash}`} target="_blank" rel="noopener noreferrer"
                                                    className="block bg-orange-500/5 hover:bg-orange-500/10 text-orange-600 p-3 rounded-xl font-bold text-xs text-center transition-all border border-orange-500/10 hover:border-orange-500/30 active:scale-[0.98]">
                                                    View on BaseScan <ExternalLink className="w-3 h-3 inline ml-1 opacity-50" />
                                                </a>
                                            </div>
                                        </div>
                                    )}

                                    {deployResult.message && (
                                        <div className="w-full max-w-sm bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl p-3 mb-6 text-left">
                                            <p className="font-mono text-[10px] text-gray-500 leading-relaxed">{deployResult.message}</p>
                                        </div>
                                    )}

                                    <div className="w-full space-y-3 max-w-sm">
                                        <CLIButton variant="primary" onClick={deployAnother} fullWidth
                                            className="py-4 !bg-orange-500 hover:!bg-orange-600 shadow-lg shadow-orange-500/20">
                                            <Rocket className="w-4 h-4 mr-2" /> Launch Another
                                        </CLIButton>
                                        <button onClick={() => router.push('/')}
                                            className="w-full py-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                                            <ArrowLeft className="w-4 h-4" /> Home
                                        </button>
                                    </div>
                                </motion.div>
                            )
                        }

                        {/* ─── ERROR ──────────────────────────────────────────────────────── */}
                        {
                            step === 'error' && (
                                <motion.div key="error" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }} className="py-10 flex flex-col items-center w-full text-center">

                                    <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 border-4 border-white ring-4 ring-red-50">
                                        <AlertTriangle className="w-10 h-10 text-red-500" />
                                    </div>

                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Launch Failed</h2>
                                    <div className="bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 p-4 rounded-xl text-xs font-mono mb-8 max-w-sm w-full mx-auto text-left overflow-x-auto border border-red-100 dark:border-red-900/30">
                                        {deployLogs.find(l => l.startsWith('✗')) || 'Unknown error occurred'}
                                    </div>

                                    <div className="w-full space-y-3 max-w-sm">
                                        <button onClick={() => setStep('review')}
                                            className="w-full py-3.5 bg-orange-500 text-white rounded-xl font-medium shadow-xl active:scale-[0.98] transition-all hover:bg-orange-600">
                                            Try Again
                                        </button>
                                        <button onClick={resetForm}
                                            className="w-full py-3.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium">
                                            Reset Form
                                        </button>
                                    </div>

                                    {/* Stuck Funds Recovery - Show immediately on error */}
                                    <div className="w-full max-w-sm">
                                        <RecoveryManager address={address || ''} onRecovered={refreshBalance} />
                                    </div>
                                </motion.div>
                            )
                        }
                    </AnimatePresence >
                </div >
            </main >

            {/* Footer */}
            < footer className="relative z-10 px-3 sm:px-4 py-2.5 sm:py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-gray-100/80 dark:border-gray-800/80 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md" >
                <div className="flex items-center justify-between max-w-lg mx-auto">
                    <p className="font-mono text-[10px] text-gray-400 dark:text-gray-600">Bankr AI Agent Engine</p>
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-gray-400 dark:text-gray-600">Base · x402</span>
                        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }}
                            className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]" />
                    </div>
                </div>
            </footer >
        </div >
    );
}
