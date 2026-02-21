'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Rocket, Check, AlertCircle, ChevronDown, ChevronUp,
    Shield, Zap, Copy, ExternalLink, Clipboard, Globe, MessageCircle,
    FileText, Twitter, Share2, Settings, AlertTriangle, User, Coins, RefreshCw
} from 'lucide-react';
import { useTelegramContext } from '@/components/layout/TelegramProvider';
import { useWallet } from '@/contexts/WalletContext';
import { showBackButton, hideBackButton, hapticFeedback } from '@/lib/telegram/webapp';
import { Terminal, TerminalLine } from '@/components/ui/Terminal';
import { CLIButton, CLICard, StatusBadge } from '@/components/ui/CLIButton';
import { shortenAddress } from '@/lib/utils';

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
    telegram: string;
    launcherType: FeeType;
    launcher: string;
    dashboardFeeType: FeeType;
    dashboardFee: string;
    taxType: TaxType;
    taxPercentage: number;
    rewardRecipient: string;
    vanityEnabled: boolean;
    vanitySuffix: string;
    salt: string;
    autoSweep: boolean;
    customGasLimit: boolean;
}

const INITIAL_CONFIG: BankrConfig = {
    name: '', symbol: '', image: '', description: '',
    tweet: '', cast: '', website: '', telegram: '',
    launcherType: 'x', launcher: '',
    dashboardFeeType: 'x', dashboardFee: '',
    taxType: 'static', taxPercentage: 10,
    rewardRecipient: '',
    vanityEnabled: false, vanitySuffix: 'bA3',
    salt: '',
    autoSweep: true, customGasLimit: false,
};

const STORAGE_KEY = 'bankr_launch_form';

// ─── Sub-Components ────────────────────────────────────────────────────────────

function MobileInput({
    label, value, onChange, placeholder, error, multiline = false, uppercase = false, hint,
}: {
    label: string; value: string; onChange: (v: string) => void;
    placeholder: string; error?: string; multiline?: boolean;
    uppercase?: boolean; hint?: string;
}) {
    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            onChange(uppercase ? text.toUpperCase() : text.trim());
            hapticFeedback('light');
        } catch { }
    };

    const ACCENT = 'focus:border-orange-500 focus:ring-orange-500/20';
    const cls = `w-full bg-white dark:bg-gray-900 border ${error ? 'border-red-300 dark:border-red-500/50' : 'border-gray-200 dark:border-gray-800'} rounded-xl px-4 py-3 pr-12 font-mono text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none ${ACCENT} focus:ring-2 transition-all`;

    return (
        <div className="space-y-1">
            {label && (
                <label className="block font-mono text-xs text-gray-500 dark:text-gray-400">
                    <span className="text-orange-500 font-medium">const</span> {label} <span className="text-gray-400 dark:text-gray-600">=</span>
                </label>
            )}
            <div className="relative">
                {multiline ? (
                    <textarea value={value} onChange={(e) => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
                        placeholder={placeholder} rows={2} className={cls + ' resize-none'} />
                ) : (
                    <input type="text" value={value} onChange={(e) => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
                        placeholder={placeholder} className={cls} />
                )}
                <button type="button" onClick={handlePaste}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                    <Clipboard className="w-4 h-4" />
                </button>
            </div>
            {hint && !error && <p className="font-mono text-[10px] text-gray-500">{hint}</p>}
            {error && <p className="font-mono text-xs text-red-500">Error: {error}</p>}
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
            <label className="block font-mono text-xs text-gray-500 dark:text-gray-400">{label}</label>
            <div className="grid grid-cols-2 gap-2">
                {options.map((opt) => (
                    <button key={opt} type="button"
                        onClick={() => { onChange(opt); hapticFeedback('light'); }}
                        className={`p-3 rounded-xl border font-mono text-xs text-left transition-all ${value === opt
                            ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                            : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700'
                            }`}>
                        <div className="font-semibold text-gray-800 dark:text-gray-200">{opt}</div>
                        {descriptions?.[opt] && <div className="text-[10px] text-gray-500 mt-1">{descriptions[opt]}</div>}
                    </button>
                ))}
            </div>
        </div>
    );
}

function CollapsibleSection({
    title, icon: Icon, children, defaultOpen = false
}: {
    title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-900/40">
            <button type="button" onClick={() => { setIsOpen(!isOpen); hapticFeedback('light'); }}
                className="w-full p-3 flex items-center justify-between bg-gray-50 dark:bg-gray-900/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <span className="font-mono text-xs flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <Icon className="w-4 h-4 text-orange-500" />
                    {title}
                </span>
                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="p-3 space-y-4 border-t border-gray-100 dark:border-gray-800">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function BankrLaunchPage() {
    const router = useRouter();
    const { isAuthenticated, formattedAddress, address } = useWallet();
    const { isTelegram } = useTelegramContext();

    const [step, setStep] = useState<BankrStep>('form');
    const [config, setConfig] = useState<BankrConfig>(INITIAL_CONFIG);
    const [isLoaded, setIsLoaded] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [deployLogs, setDeployLogs] = useState<string[]>([]);
    const [deployResult, setDeployResult] = useState<{ txHash?: string; message?: string; deployedViaFallback?: boolean } | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [isDeploying, setIsDeploying] = useState(false);
    const [isAdvanced, setIsAdvanced] = useState(false);

    // Persistence: Load
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) setConfig(prev => ({ ...prev, ...JSON.parse(saved) }));
            const prefs = localStorage.getItem('clanker_prefs');
            if (prefs) {
                const parsed = JSON.parse(prefs);
                setConfig(prev => ({
                    ...prev,
                    autoSweep: parsed.autoSweep !== false,
                    customGasLimit: parsed.customGasLimit === true,
                }));
            }
        } catch { }
        setIsLoaded(true);
    }, []);

    // Set address defaults
    useEffect(() => {
        if (address && !config.rewardRecipient) {
            setConfig(prev => ({ ...prev, rewardRecipient: address, launcher: prev.launcher }));
        }
    }, [address]);

    // Smart salt logic (suffix-based for bA3...)
    useEffect(() => {
        if (!isLoaded) return;
        if (config.vanityEnabled) {
            // Vanity ON = suffix bA3, salt that produces address ending in bA3...
            // We instruct the AI agent via prompt — salt itself is random, the SUFFIX is the key instruction
            if (!config.salt) {
                const randomSalt = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
                setConfig(p => ({ ...p, salt: randomSalt }));
            }
        } else {
            const randomSalt = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
            setConfig(p => ({ ...p, salt: randomSalt }));
        }
    }, [config.vanityEnabled, isLoaded]);

    // Persistence: Save
    useEffect(() => {
        if (isLoaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }, [config, isLoaded]);

    // Back button for Telegram
    useEffect(() => {
        if (isTelegram) {
            showBackButton(() => router.push('/bankr'));
            return () => hideBackButton();
        }
    }, [isTelegram, router]);

    const getPlaceholder = (type: FeeType) => {
        switch (type) {
            case 'x': return '@username';
            case 'farcaster': return '@handle or URL';
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
        if (!config.name) errs.name = 'Required';
        if (!config.symbol) errs.symbol = 'Required';
        if (!config.launcher) errs.launcher = 'Required';
        if (!config.dashboardFee) errs.dashboardFee = 'Required';
        if (!config.rewardRecipient || !/^0x[a-fA-F0-9]{40}$/i.test(config.rewardRecipient)) {
            errs.rewardRecipient = 'Invalid EVM address';
        }
        if (config.image && !/^(https?:\/\/|ipfs:\/\/|baf|Qm)/.test(config.image)) {
            errs.image = 'Must be an IPFS CID or valid URL';
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
        addLog(`Token: ${config.name} ($${config.symbol})`);
        addLog(`Launcher: ${config.launcherType}:${config.launcher}`);
        addLog(`Fee Recipient: ${config.dashboardFeeType}:${config.dashboardFee}`);
        addLog(`Tax: ${config.taxType.toUpperCase()}${config.taxType === 'static' ? ` (${config.taxPercentage}%)` : ''}`);
        if (config.vanityEnabled) addLog(`Vanity: Contract suffix ...${config.vanitySuffix}`);
        addLog('---');
        addLog('Setting up Burner Wallet Proxy...');

        await new Promise(r => setTimeout(r, 800));
        addLog('Securing x402 payment channel...');
        await new Promise(r => setTimeout(r, 500));
        addLog('Negotiating with Bankr Agent...');

        try {
            const response = await fetch('/api/bankr/launch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: config.name,
                    symbol: config.symbol.toUpperCase(),
                    image: config.image || undefined,
                    description: config.description || undefined,
                    tweet: config.tweet || undefined,
                    cast: config.cast || undefined,
                    telegram: config.telegram || undefined,
                    website: config.website || undefined,
                    launcherType: config.launcherType,
                    launcher: config.launcher,
                    dashboardFeeType: config.dashboardFeeType,
                    dashboardFee: config.dashboardFee,
                    taxType: config.taxType,
                    taxPercentage: config.taxPercentage,
                    rewardRecipient: config.rewardRecipient,
                    salt: config.salt || undefined,
                    vanityEnabled: config.vanityEnabled,
                    vanitySuffix: config.vanityEnabled ? config.vanitySuffix : undefined,
                    autoSweep: config.autoSweep,
                    customGasLimit: config.customGasLimit,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to launch via Bankr');
            }

            await new Promise(r => setTimeout(r, 400));
            addLog(`TX: ${data.txHash ? data.txHash.slice(0, 12) : '...'}...`);
            addLog('✓ Submitted to Bankr Agent');
            if (data.deployedViaFallback) {
                addLog('⚡ Deployed via Clanker SDK Fallback');
            }
            addLog('✓ Confirmed on Base!');

            setDeployResult(data);
            hapticFeedback('success');
            setStep('success');

        } catch (error) {
            addLog(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            hapticFeedback('error');
            setStep('error');
        } finally {
            setIsDeploying(false);
        }
    };

    const resetForm = () => {
        setStep('form');
        setConfig({ ...INITIAL_CONFIG, rewardRecipient: address || '' });
        setErrors({});
        setDeployLogs([]);
        setDeployResult(null);
    };

    const deployAnother = () => {
        setStep('form');
        setConfig(prev => ({
            ...prev, name: '', symbol: '', image: '', description: '',
            tweet: '', cast: '',
        }));
        setErrors({});
        setDeployLogs([]);
        setDeployResult(null);
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
            <div className="absolute -top-20 -right-20 w-40 sm:w-80 h-40 sm:h-80 bg-orange-500/5 dark:bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-32 h-32 bg-amber-500/5 dark:bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <header className="relative z-10 px-3 sm:px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between border-b border-gray-100/80 dark:border-gray-800/80 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    {!isTelegram && (
                        <motion.button whileTap={{ scale: 0.95 }} onClick={() => router.push('/bankr')}
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
                            <p className="font-mono text-[10px] text-gray-500 dark:text-gray-400">AI Agent Engine</p>
                        </div>
                    </div>
                </div>
                <div className="hidden sm:block">
                    <StatusBadge status="online" text={formattedAddress || ''} />
                </div>
            </header>

            {/* Main */}
            <main className="flex-1 p-3 relative z-10 overflow-y-auto">
                <div className="max-w-lg mx-auto">
                    <AnimatePresence mode="wait">

                        {/* ── FORM ──────────────────────────────────────────── */}
                        {step === 'form' && (
                            <motion.div key="form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                                <Terminal title="Token Launch Configuration" className="w-full">

                                    {/* Advanced toggle */}
                                    <div className="mb-4 flex items-center justify-between gap-3">
                                        <div className="flex-1 p-2.5 rounded-lg bg-orange-50/50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30 flex items-center justify-between">
                                            <span className="font-mono text-[10px] text-gray-500">Bankr Agent</span>
                                            <span className="font-mono text-xs text-orange-500 font-bold flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                                                Active
                                            </span>
                                        </div>
                                        <button type="button"
                                            onClick={() => { setIsAdvanced(!isAdvanced); hapticFeedback('light'); }}
                                            className={`p-2.5 rounded-lg border flex items-center gap-2 transition-all ${isAdvanced
                                                ? 'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-700 text-gray-800 dark:text-gray-200'
                                                : 'bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-800 text-gray-500 hover:bg-gray-50'}`}>
                                            <Settings className="w-4 h-4" />
                                            <span className="font-mono text-[10px] font-medium">{isAdvanced ? 'ADVANCED' : 'BASIC'}</span>
                                        </button>
                                    </div>

                                    {/* Basic Token Info */}
                                    <div className="space-y-4 mb-4">
                                        <div className="flex gap-4">
                                            <div className="flex-1">
                                                <MobileInput label="name" value={config.name}
                                                    onChange={(v) => setConfig(p => ({ ...p, name: v }))}
                                                    placeholder="My Token" error={errors.name} hint="Token name (required)" />
                                            </div>
                                            <div className="w-1/3">
                                                <MobileInput label="symbol" value={config.symbol}
                                                    onChange={(v) => setConfig(p => ({ ...p, symbol: v }))}
                                                    placeholder="TKN" uppercase error={errors.symbol} hint="Max 10 chars" />
                                            </div>
                                        </div>

                                        <MobileInput label="description" value={config.description}
                                            onChange={(v) => setConfig(p => ({ ...p, description: v }))}
                                            placeholder="Token description..." multiline hint="Shown on Bankr dashboard (optional)" />

                                        <MobileInput label="image" value={config.image}
                                            onChange={(v) => setConfig(p => ({ ...p, image: v }))}
                                            placeholder="CID or Image URL" error={errors.image} hint="IPFS CID or https:// URL" />

                                        {config.image && (
                                            <div className="flex gap-3 items-center p-2 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                                                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 shrink-0">
                                                    <img src={config.image.startsWith('ipfs://') ? `https://gateway.pinata.cloud/ipfs/${config.image.replace('ipfs://', '')}` : config.image}
                                                        alt="preview" className="w-full h-full object-cover"
                                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                                </div>
                                                <p className="font-mono text-[10px] text-gray-500 truncate max-w-[220px]">{config.image}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Collapsible Sections */}
                                    <div className="space-y-3">
                                        <CollapsibleSection title="Social Links" icon={Globe}>
                                            <div className="grid grid-cols-1 gap-3">
                                                <MobileInput label="tweet" value={config.tweet}
                                                    onChange={v => setConfig(p => ({ ...p, tweet: v }))} placeholder="https://x.com/..." />
                                                <MobileInput label="cast" value={config.cast}
                                                    onChange={v => setConfig(p => ({ ...p, cast: v }))} placeholder="https://warpcast.com/..." />
                                                <MobileInput label="telegram" value={config.telegram}
                                                    onChange={v => setConfig(p => ({ ...p, telegram: v }))} placeholder="https://t.me/..." />
                                                <MobileInput label="website" value={config.website}
                                                    onChange={v => setConfig(p => ({ ...p, website: v }))} placeholder="https://..." />
                                            </div>
                                        </CollapsibleSection>

                                        {/* Launcher Identity */}
                                        <CollapsibleSection title="Launcher Identity" icon={User} defaultOpen>
                                            <div className="space-y-4">
                                                <OptionSelector label="Launcher Profile Type" value={config.launcherType}
                                                    options={['x', 'farcaster', 'ens', 'wallet']}
                                                    onChange={v => setConfig(p => ({ ...p, launcherType: v as FeeType }))}
                                                    descriptions={{ x: 'Twitter/X handle', farcaster: 'Farcaster handle', ens: 'ENS name', wallet: 'EVM wallet' }} />
                                                <MobileInput label="launcher_handle" value={config.launcher}
                                                    onChange={v => setConfig(p => ({ ...p, launcher: v }))}
                                                    placeholder={getPlaceholder(config.launcherType)} error={errors.launcher}
                                                    hint="Your identity on the Bankr dashboard" />
                                            </div>
                                        </CollapsibleSection>

                                        {/* Fee Distribution */}
                                        <CollapsibleSection title="Fee Distribution" icon={Coins} defaultOpen>
                                            <div className="space-y-4">
                                                <OptionSelector label="Dashboard Fee Profile" value={config.dashboardFeeType}
                                                    options={['x', 'farcaster', 'ens', 'wallet']}
                                                    onChange={v => setConfig(p => ({ ...p, dashboardFeeType: v as FeeType }))}
                                                    descriptions={{ x: 'X identity', farcaster: 'Farcaster', ens: 'ENS name', wallet: 'Direct wallet' }} />
                                                <MobileInput label="fee_handle" value={config.dashboardFee}
                                                    onChange={v => setConfig(p => ({ ...p, dashboardFee: v }))}
                                                    placeholder={getPlaceholder(config.dashboardFeeType)} error={errors.dashboardFee}
                                                    hint="Displayed on Clanker dashboard as interface fee recipient" />

                                                <OptionSelector label="Tax Mode" value={config.taxType}
                                                    options={['dynamic', 'static']}
                                                    onChange={v => setConfig(p => ({ ...p, taxType: v as TaxType }))}
                                                    descriptions={{ dynamic: 'Auto 1-10%', static: `Fixed ${config.taxPercentage}%` }} />

                                                {config.taxType === 'static' && (
                                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="pt-2 px-1">
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

                                                <MobileInput label="on_chain_recipient" value={config.rewardRecipient}
                                                    onChange={v => setConfig(p => ({ ...p, rewardRecipient: v }))}
                                                    placeholder={address || '0x...'} error={errors.rewardRecipient}
                                                    hint="Real on-chain fee recipient (EVM address)" />
                                            </div>
                                        </CollapsibleSection>

                                        {/* Advanced Settings */}
                                        <AnimatePresence>
                                            {isAdvanced && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }} className="space-y-3 overflow-hidden">

                                                    {/* Vanity Section */}
                                                    <div className="p-4 rounded-xl border border-purple-100 dark:border-purple-900/30 bg-purple-50/20 dark:bg-purple-900/10 space-y-4">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                                                                    <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                                                </div>
                                                                <div>
                                                                    <h4 className="font-mono text-xs font-bold text-gray-800 dark:text-gray-200">Vanity Contract Suffix</h4>
                                                                    <p className="text-[10px] text-gray-500">Contract address will end in <code className="text-purple-600">.{config.vanitySuffix}</code></p>
                                                                </div>
                                                            </div>
                                                            <button type="button"
                                                                onClick={() => { setConfig(p => ({ ...p, vanityEnabled: !p.vanityEnabled })); hapticFeedback('medium'); }}
                                                                className={`w-12 h-7 rounded-full transition-all duration-300 relative ${config.vanityEnabled ? 'bg-purple-600 shadow-inner' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                                                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${config.vanityEnabled ? 'left-6' : 'left-1'}`} />
                                                            </button>
                                                        </div>

                                                        {config.vanityEnabled && (
                                                            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                                                                <MobileInput label="vanity_suffix" value={config.vanitySuffix}
                                                                    onChange={v => setConfig(p => ({ ...p, vanitySuffix: v }))}
                                                                    placeholder="bA3" hint="The Bankr Agent will target a contract address ending in this suffix string." />
                                                                <p className="font-mono text-[10px] text-purple-500 dark:text-purple-400">
                                                                    ⚠ Vanity suffix search may significantly increase deployment time.
                                                                </p>
                                                            </motion.div>
                                                        )}
                                                    </div>

                                                    {/* Technical Settings */}
                                                    <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 space-y-3">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <Zap className="w-4 h-4 text-amber-500" />
                                                            <span className="font-mono text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Agent Settings</span>
                                                        </div>

                                                        <button type="button"
                                                            onClick={() => { setConfig(p => ({ ...p, autoSweep: !p.autoSweep })); hapticFeedback('light'); }}
                                                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${config.autoSweep ? 'bg-orange-500/5 border-orange-500/20' : 'bg-white dark:bg-gray-950 border-gray-100 dark:border-gray-800'}`}>
                                                            <div className="text-left">
                                                                <p className="font-display font-bold text-xs text-gray-800 dark:text-gray-200">Auto-Sweep Residuals</p>
                                                                <p className="font-mono text-[10px] text-gray-500">Refund leftover ETH/USDC to main wallet</p>
                                                            </div>
                                                            <div className={`w-10 h-5 rounded-full relative transition-all ${config.autoSweep ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${config.autoSweep ? 'left-5' : 'left-0.5'}`} />
                                                            </div>
                                                        </button>

                                                        <button type="button"
                                                            onClick={() => { setConfig(p => ({ ...p, customGasLimit: !p.customGasLimit })); hapticFeedback('light'); }}
                                                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${config.customGasLimit ? 'bg-orange-500/5 border-orange-500/20' : 'bg-white dark:bg-gray-950 border-gray-100 dark:border-gray-800'}`}>
                                                            <div className="text-left">
                                                                <p className="font-display font-bold text-xs text-gray-800 dark:text-gray-200">Priority Gas Mode</p>
                                                                <p className="font-mono text-[10px] text-gray-500">Override default gas limits on Base</p>
                                                            </div>
                                                            <div className={`w-10 h-5 rounded-full relative transition-all ${config.customGasLimit ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${config.customGasLimit ? 'left-5' : 'left-0.5'}`} />
                                                            </div>
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-3 mt-6">
                                        <CLIButton variant="ghost" onClick={() => router.push('/bankr')}>Cancel</CLIButton>
                                        <CLIButton variant="primary" onClick={handleReview} fullWidth
                                            icon={<Rocket className="w-4 h-4" />}
                                            className="!bg-orange-500 hover:!bg-orange-600 shadow-lg shadow-orange-500/20">
                                            Review
                                        </CLIButton>
                                    </div>
                                </Terminal>
                            </motion.div>
                        )}

                        {/* ── REVIEW ────────────────────────────────────────── */}
                        {step === 'review' && (
                            <motion.div key="review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                                <Terminal title="Review Launch" className="w-full">
                                    <TerminalLine text="Review your configuration:" type="command" />
                                    <CLICard className="mt-4 bg-white dark:bg-gray-900/80 border-gray-200 dark:border-gray-800">
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-bold">{config.name}</span></div>
                                            <div className="flex justify-between"><span className="text-gray-500">Symbol</span><span className="text-orange-500 font-medium">${config.symbol}</span></div>
                                            {config.description && <div className="flex justify-between items-start"><span className="text-gray-500 shrink-0">Description</span><span className="text-xs text-right max-w-[180px] truncate">{config.description}</span></div>}
                                            {config.image && <div className="flex justify-between items-start"><span className="text-gray-500 shrink-0">Image</span><span className="text-xs text-right max-w-[180px] truncate">{config.image}</span></div>}
                                            <div className="border-t border-gray-100 dark:border-gray-800 pt-2 mt-2 space-y-1">
                                                <div className="flex justify-between"><span className="text-gray-500">Launcher</span><span className="text-xs font-mono">{config.launcherType}:{config.launcher}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">Fee To</span><span className="text-xs font-mono">{config.dashboardFeeType}:{config.dashboardFee}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">Tax</span><span className="text-xs font-mono">{config.taxType.toUpperCase()}{config.taxType === 'static' ? ` (${config.taxPercentage}%)` : ''}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">Recipient</span><span className="text-xs font-mono">{shortenAddress(config.rewardRecipient)}</span></div>
                                            </div>
                                            {config.vanityEnabled && (
                                                <div className="flex justify-between items-center pt-1 border-t border-gray-100 dark:border-gray-800">
                                                    <span className="text-gray-500">Vanity Suffix</span>
                                                    <span className="text-purple-500 font-mono text-xs">...{config.vanitySuffix}</span>
                                                </div>
                                            )}
                                            <div className="border-t border-gray-100 dark:border-gray-800 pt-2 mt-2 space-y-1 text-xs">
                                                <div className="flex justify-between"><span className="text-gray-500">Auto-Sweep</span><span className={config.autoSweep ? 'text-orange-500' : 'text-gray-400'}>{config.autoSweep ? 'ON' : 'OFF'}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">Priority Gas</span><span className={config.customGasLimit ? 'text-orange-500' : 'text-gray-400'}>{config.customGasLimit ? 'ON' : 'OFF'}</span></div>
                                                <div className="flex justify-between font-bold text-orange-500">
                                                    <span>Agent Cost</span><span>~0.0007 ETH + $0.10 USDC</span>
                                                </div>
                                            </div>
                                        </div>
                                    </CLICard>
                                    <div className="flex gap-3 mt-6">
                                        <CLIButton variant="ghost" onClick={() => setStep('form')}>Edit</CLIButton>
                                        <CLIButton variant="primary" onClick={handleDeploy} fullWidth
                                            icon={<Rocket className="w-4 h-4" />} loading={isDeploying}
                                            className="!bg-orange-500 hover:!bg-orange-600 shadow-lg shadow-orange-500/20">
                                            Launch Now
                                        </CLIButton>
                                    </div>
                                </Terminal>
                            </motion.div>
                        )}

                        {/* ── DEPLOYING ─────────────────────────────────────── */}
                        {step === 'deploying' && (
                            <motion.div key="deploying" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.5, ease: 'easeOut' }}
                                className="py-12 flex flex-col items-center w-full relative">

                                {/* Animated Rocket */}
                                <div className="relative mb-8 flex items-center justify-center">
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                                        className="absolute w-32 h-32 rounded-full border-t-2 border-r-2 border-orange-500 opacity-50 drop-shadow-[0_0_15px_rgba(249,115,22,0.5)]" />
                                    <motion.div animate={{ rotate: -360 }} transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                                        className="absolute w-28 h-28 rounded-full border-b-2 border-l-2 border-amber-400 opacity-60 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" />
                                    <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.8, 0.3] }}
                                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                        className="absolute w-20 h-20 rounded-full bg-orange-500/30 blur-xl" />
                                    <div className="w-16 h-16 bg-white dark:bg-gray-900 border border-orange-500/30 rounded-full flex items-center justify-center relative z-10 shadow-[0_0_30px_rgba(249,115,22,0.2)]">
                                        <Rocket className="w-8 h-8 text-orange-500" />
                                    </div>
                                </div>

                                <motion.h2 animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                    className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-amber-500 mb-2 font-display text-center">
                                    Deploying via Bankr...
                                </motion.h2>
                                <p className="text-gray-500 dark:text-gray-400 mb-8 text-xs font-mono tracking-widest uppercase text-center">Contacting AI Agent</p>

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
                                    <div className="p-4 h-64 overflow-y-auto space-y-2 scrollbar-hide text-orange-400 font-mono leading-relaxed relative z-10">
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
                        )}

                        {/* ── SUCCESS ───────────────────────────────────────── */}
                        {step === 'success' && deployResult && (
                            <motion.div key="success" initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                className="py-6 flex flex-col items-center w-full text-center">

                                <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-xl border-4 border-white ring-4 ${deployResult.deployedViaFallback ? 'bg-amber-50 ring-amber-50 shadow-amber-500/10' : 'bg-green-50 ring-green-50 shadow-green-500/10'}`}>
                                    <Check className={`w-10 h-10 ${deployResult.deployedViaFallback ? 'text-amber-600' : 'text-green-600'}`} />
                                </div>

                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                                    {deployResult.deployedViaFallback ? 'Launched via Fallback!' : 'Launch Successful!'}
                                </h2>
                                <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
                                    {deployResult.deployedViaFallback
                                        ? 'Bankr Agent was overwhelmed. Token deployed via Clanker SDK fallback.'
                                        : 'Your token is live on Base via Bankr Agent.'}
                                </p>

                                {deployResult.txHash && (
                                    <div className="w-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm mb-6 text-left space-y-4 relative overflow-hidden max-w-sm">
                                        <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${deployResult.deployedViaFallback ? 'from-amber-400 to-orange-500' : 'from-orange-400 to-amber-500'}`} />
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-1.5">Transaction Hash</p>
                                            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700 group hover:border-orange-200 dark:hover:border-orange-800 transition-colors cursor-pointer"
                                                onClick={() => copyField(deployResult.txHash!, 'tx')}>
                                                <code className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1 font-mono font-medium">{deployResult.txHash}</code>
                                                <div className="text-gray-400 group-hover:text-gray-600">
                                                    {copiedField === 'tx' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-3">
                                            <a href={`https://basescan.org/tx/${deployResult.txHash}`} target="_blank" rel="noopener noreferrer"
                                                className="bg-orange-500/5 hover:bg-orange-500/10 text-orange-600 p-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all border border-orange-500/10 hover:border-orange-500/30 active:scale-[0.98]">
                                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                View on BaseScan
                                                <ExternalLink className="w-3 h-3 opacity-50" />
                                            </a>
                                        </div>
                                    </div>
                                )}

                                <div className="w-full space-y-3 max-w-sm">
                                    <CLIButton variant="primary" onClick={deployAnother} fullWidth
                                        className="py-4 text-base shadow-lg shadow-orange-500/20 !bg-orange-500 hover:!bg-orange-600">
                                        <Rocket className="w-4 h-4 mr-2" /> Launch Another
                                    </CLIButton>
                                    <button onClick={() => router.push('/bankr')}
                                        className="w-full py-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                                        <ArrowLeft className="w-4 h-4" /> Bankr Dashboard
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* ── ERROR ─────────────────────────────────────────── */}
                        {step === 'error' && (
                            <motion.div key="error" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }} className="py-10 flex flex-col items-center w-full text-center">

                                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 border-4 border-white ring-4 ring-red-50">
                                    <AlertTriangle className="w-10 h-10 text-red-500" />
                                </div>

                                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Launch Failed</h2>
                                <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-mono mb-8 max-w-sm w-full mx-auto text-left overflow-x-auto border border-red-100">
                                    {deployLogs.find(l => l.startsWith('✗')) || 'Unknown error occurred'}
                                </div>

                                <div className="w-full space-y-3 max-w-sm">
                                    <button onClick={() => setStep('review')}
                                        className="w-full py-3.5 bg-orange-500 text-white rounded-xl font-medium shadow-xl active:scale-[0.98] transition-all">
                                        Try Again
                                    </button>
                                    <button onClick={resetForm}
                                        className="w-full py-3.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium">
                                        Reset Form
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>

            {/* Footer */}
            <footer className="relative z-10 px-3 sm:px-4 py-2.5 sm:py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-gray-100/80 dark:border-gray-800/80 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md">
                <div className="flex items-center justify-between max-w-lg mx-auto">
                    <p className="font-mono text-[10px] text-gray-400 dark:text-gray-600">Bankr AI Agent Engine</p>
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-gray-400 dark:text-gray-600">x402</span>
                        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }}
                            className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]" />
                    </div>
                </div>
            </footer>
        </div>
    );
}
