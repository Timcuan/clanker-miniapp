'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { z } from 'zod';
import { Rocket, ArrowLeft, Image as ImageIcon, Twitter, CheckCircle2, ChevronDown } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { CLIButton, CLIInput, StatusBadge } from '@/components/ui/CLIButton';
import { Terminal, TerminalLine, TerminalLoader, ResponsiveAscii } from '@/components/ui/Terminal';

// Schema mapping to `@bankr/cli` fields
const feeTypes = ['x', 'farcaster', 'ens', 'wallet'] as const;

export const bankrLaunchSchema = z.object({
    name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
    symbol: z.string().min(1, 'Symbol is required').max(10, 'Symbol too long'),
    image: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    tweet: z.string().url('Must be a valid X/Twitter URL').optional().or(z.literal('')),
    cast: z.string().url('Must be a valid Farcaster Cast URL').optional().or(z.literal('')),
    launcherType: z.enum(feeTypes, { required_error: 'Launcher type is required' }),
    launcher: z.string().min(1, 'Launcher identity is required'),
    dashboardFeeType: z.enum(feeTypes, { required_error: 'Fee type is required' }),
    dashboardFee: z.string().min(1, 'Fee recipient is required'),
    taxType: z.enum(['dynamic', 'static']),
    taxPercentage: z.number().min(0).max(90),
    rewardRecipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/i, 'Must be a valid EVM address'),
    salt: z.string().optional(),
    description: z.string().optional(),
    telegram: z.string().url('Must be a valid Telegram URL').optional().or(z.literal('')),
    website: z.string().url('Must be a valid website URL').optional().or(z.literal('')),
    autoSweep: z.boolean().optional(),
    customGasLimit: z.boolean().optional(),
});

type BankrLaunchFormParams = z.infer<typeof bankrLaunchSchema>;

export default function BankrLaunchPage() {
    const router = useRouter();
    const { isAuthenticated, formattedAddress, address } = useWallet();

    const [step, setStep] = useState<'form' | 'processing' | 'success'>('form');
    const [loadingText, setLoadingText] = useState('Initializing agent...');

    // Form State
    const [formData, setFormData] = useState<BankrLaunchFormParams>({
        name: '',
        symbol: '',
        image: '',
        tweet: '',
        cast: '',
        launcherType: 'x',
        launcher: '',
        dashboardFeeType: 'x',
        dashboardFee: '',
        taxType: 'dynamic',
        taxPercentage: 10,
        rewardRecipient: address || '',
        salt: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
        description: '',
        telegram: '',
        website: '',
        autoSweep: true,
        customGasLimit: false,
    });

    const [vanityEnabled, setVanityEnabled] = useState(false);

    const [errors, setErrors] = useState<Partial<Record<keyof BankrLaunchFormParams, string>>>({});
    const [submitError, setSubmitError] = useState<string>('');
    const [resultData, setResultData] = useState<{ txHash?: string, message?: string, deployedViaFallback?: boolean } | null>(null);

    // Load Settings Preferences from Local Storage
    useState(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('clanker_prefs');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    setFormData(prev => ({
                        ...prev,
                        autoSweep: parsed.autoSweep !== false, // Defaults to true if missing
                        customGasLimit: parsed.customGasLimit === true
                    }));
                }
            } catch (e) {
                console.error("Failed to load generic prefs on launch screen");
            }
        }
    });

    // Fee Type specific placeholders
    const getFeePlaceholder = (type: BankrLaunchFormParams['dashboardFeeType']) => {
        switch (type) {
            case 'x': return '@username (Twitter/X handle)';
            case 'farcaster': return '@username (Farcaster handle)';
            case 'ens': return 'vitalik.eth';
            case 'wallet': return '0x...';
        }
    };

    const handleValidation = () => {
        try {
            // For literal '', zod .optional().or(z.literal('')) works, but transform to undefined for API if empty
            const dataToValidate = {
                ...formData,
                image: formData.image || undefined,
                tweet: formData.tweet || undefined,
                cast: formData.cast || undefined,
                telegram: formData.telegram || undefined,
                website: formData.website || undefined,
            };

            bankrLaunchSchema.parse(dataToValidate);
            setErrors({});
            return true;
        } catch (error) {
            if (error instanceof z.ZodError) {
                const formattedErrors: Record<string, string> = {};
                error.errors.forEach(err => {
                    if (err.path[0]) {
                        formattedErrors[err.path[0] as string] = err.message;
                    }
                });
                setErrors(formattedErrors);
            }
            return false;
        }
    };

    const handleSubmit = async () => {
        if (!handleValidation()) return;

        setStep('processing');
        setSubmitError('');

        try {
            setLoadingText('Securing x402 payment channel...');
            // Sleep to simulate UI progress safely, as real fetch takes time
            await new Promise(r => setTimeout(r, 600));

            setLoadingText('Negotiating with Bankr Agent...');

            const response = await fetch('/api/bankr/launch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to launch token via Bankr');
            }

            setResultData(data);
            setStep('success');

        } catch (error) {
            console.error('Bankr Launch Error:', error);
            setSubmitError(error instanceof Error ? error.message : 'Unknown error occurred');
            setStep('form');
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="h-[100dvh] flex items-center justify-center p-4 bg-umkm-dark">
                <Terminal title="auth-error">
                    <TerminalLine text="Unauthorized access. Wallet not connected." type="error" />
                    <CLIButton variant="secondary" onClick={() => router.push('/')} className="mt-4">Return Home</CLIButton>
                </Terminal>
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] flex flex-col bg-umkm-dark text-umkm-light">
            {/* Background */}
            <div className="fixed inset-0 bg-[url('/matrix-bg.png')] opacity-5 pointer-events-none mix-blend-overlay" />

            {/* Header */}
            <header className="relative z-10 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between border-b border-orange-500/20 bg-umkm-dark/90 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="p-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                            <Rocket className="w-4 h-4 text-orange-400" />
                        </div>
                        <div>
                            <h1 className="font-display font-bold text-sm text-orange-400">Bankr Launch</h1>
                            <p className="font-mono text-[10px] text-gray-400">Agent-driven deployments</p>
                        </div>
                    </div>
                </div>

                <StatusBadge status="online" text={formattedAddress || ''} />
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto px-4 py-6 relative z-10 scrollbar-hide flex flex-col items-center pb-24">
                <div className="w-full max-w-lg">
                    <Terminal title="bankr-launch-wizard" className="w-full">

                        <AnimatePresence mode="wait">
                            {step === 'form' && (
                                <motion.div
                                    key="form"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="space-y-5"
                                >
                                    <TerminalLine prefix=">" text="Initialize @bankr/cli deployment wizard" type="command" />
                                    <TerminalLine prefix=" " text="This mode uses the Bankr AI agent to deploy and index your token automatically." type="info" />

                                    {submitError && (
                                        <div className="p-3 mt-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-mono">
                                            Error: {submitError}
                                        </div>
                                    )}

                                    <div className="space-y-4 mt-6">
                                        {/* Name & Symbol */}
                                        <div className="flex gap-4">
                                            <div className="flex-1 space-y-1">
                                                <div className="flex items-center gap-2 mb-2 text-umkm-light font-mono text-sm">
                                                    <span className="text-orange-400">*</span> Token Name
                                                </div>
                                                <CLIInput
                                                    value={formData.name}
                                                    onChange={(v) => setFormData({ ...formData, name: v })}
                                                    placeholder="AI Protocol"
                                                    label="--name"
                                                    error={errors.name}
                                                />
                                            </div>
                                            <div className="w-1/3 space-y-1">
                                                <div className="flex items-center gap-2 mb-2 text-umkm-light font-mono text-sm">
                                                    <span className="text-orange-400">*</span> Ticker
                                                </div>
                                                <CLIInput
                                                    value={formData.symbol}
                                                    onChange={(v) => setFormData({ ...formData, symbol: v.toUpperCase() })}
                                                    placeholder="AIP"
                                                    label="--symbol"
                                                    error={errors.symbol}
                                                />
                                            </div>
                                        </div>

                                        {/* Image */}
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 text-umkm-light font-mono text-sm">
                                                    <ImageIcon className="w-3.5 h-3.5 text-gray-400" /> Image URL <span className="text-[10px] text-gray-500">(Optional)</span>
                                                </div>
                                            </div>
                                            <CLIInput
                                                value={formData.image || ''}
                                                onChange={(v) => setFormData({ ...formData, image: v })}
                                                placeholder="https://example.com/logo.png"
                                                label="--image"
                                                error={errors.image}
                                            />
                                        </div>

                                        {/* Description */}
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 text-umkm-light font-mono text-sm">
                                                    Description <span className="text-[10px] text-gray-500">(Optional)</span>
                                                </div>
                                            </div>
                                            <CLIInput
                                                value={formData.description || ''}
                                                onChange={(v) => setFormData({ ...formData, description: v })}
                                                placeholder="A revolutionary new protocol..."
                                                label="--desc"
                                                error={errors.description}
                                            />
                                        </div>

                                        {/* Social Links (Tweet, Cast, Telegram, Website) */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* X/Twitter & Farcaster Row */}
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 mb-2 text-umkm-light font-mono text-xs">
                                                    <Twitter className="w-3.5 h-3.5 text-blue-400" /> Tweet
                                                </div>
                                                <CLIInput
                                                    value={formData.tweet || ''}
                                                    onChange={(v) => setFormData({ ...formData, tweet: v })}
                                                    placeholder="https://x.com/..."
                                                    label="--x"
                                                    error={errors.tweet}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 mb-2 text-umkm-light font-mono text-xs">
                                                    <span className="text-purple-400 font-bold">F</span> Farcaster Cast
                                                </div>
                                                <CLIInput
                                                    value={formData.cast || ''}
                                                    onChange={(v) => setFormData({ ...formData, cast: v })}
                                                    placeholder="https://warpcast.com/..."
                                                    label="--cast"
                                                    error={errors.cast}
                                                />
                                            </div>

                                            {/* Telegram & Website Row */}
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 mb-2 text-umkm-light font-mono text-xs">
                                                    Telegram
                                                </div>
                                                <CLIInput
                                                    value={formData.telegram || ''}
                                                    onChange={(v) => setFormData({ ...formData, telegram: v })}
                                                    placeholder="https://t.me/..."
                                                    label="--tg"
                                                    error={errors.telegram}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 mb-2 text-umkm-light font-mono text-xs">
                                                    Website
                                                </div>
                                                <CLIInput
                                                    value={formData.website || ''}
                                                    onChange={(v) => setFormData({ ...formData, website: v })}
                                                    placeholder="https://mysite.com"
                                                    label="--web"
                                                    error={errors.website}
                                                />
                                            </div>
                                        </div>

                                        {/* Launcher Recipient & Type Row */}
                                        <div className="space-y-3 pt-2 border-t border-white/5">
                                            <div className="flex items-center gap-2 mb-2 text-umkm-light font-mono text-sm">
                                                <span className="text-orange-400">*</span> Launcher Identity <span className="text-[10px] text-gray-500 font-normal ml-1">(Displayed on Dashboard)</span>
                                            </div>

                                            <div className="flex flex-col sm:flex-row gap-3">
                                                {/* Launcher Type Selector */}
                                                <div className="sm:w-1/3">
                                                    <div className="relative">
                                                        <select
                                                            value={formData.launcherType}
                                                            onChange={(e) => setFormData({ ...formData, launcherType: e.target.value as any })}
                                                            className="w-full appearance-none bg-black/40 border-b border-gray-700 hover:border-orange-500/50 outline-none px-3 py-2 text-umkm-light text-sm font-mono transition-colors"
                                                        >
                                                            <option value="x">X / Twitter</option>
                                                            <option value="farcaster">Farcaster</option>
                                                            <option value="ens">ENS Domain</option>
                                                            <option value="wallet">Wallet Address</option>
                                                        </select>
                                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                                                    </div>
                                                </div>

                                                {/* Launcher Recipient Input */}
                                                <div className="flex-1">
                                                    <CLIInput
                                                        value={formData.launcher}
                                                        onChange={(v) => setFormData({ ...formData, launcher: v })}
                                                        placeholder={getFeePlaceholder(formData.launcherType)}
                                                        label={`--launcher`}
                                                        error={errors.launcher}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Fee Recipient & Type Row */}
                                        <div className="space-y-3 pt-2 border-t border-white/5">
                                            <div className="flex items-center gap-2 mb-2 text-umkm-light font-mono text-sm">
                                                <span className="text-orange-400">*</span> Interface Fee Distribution <span className="text-[10px] text-gray-500 font-normal ml-1">(Spoofed)</span>
                                            </div>

                                            <div className="flex flex-col sm:flex-row gap-3">
                                                {/* Fee Type Selector */}
                                                <div className="sm:w-1/3">
                                                    <div className="relative">
                                                        <select
                                                            value={formData.dashboardFeeType}
                                                            onChange={(e) => setFormData({ ...formData, dashboardFeeType: e.target.value as any })}
                                                            className="w-full appearance-none bg-black/40 border-b border-gray-700 hover:border-orange-500/50 outline-none px-3 py-2 text-umkm-light text-sm font-mono transition-colors"
                                                        >
                                                            <option value="x">X / Twitter</option>
                                                            <option value="farcaster">Farcaster</option>
                                                            <option value="ens">ENS Domain</option>
                                                            <option value="wallet">Wallet Address</option>
                                                        </select>
                                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                                                    </div>
                                                </div>

                                                {/* Fee Recipient Input */}
                                                <div className="flex-1">
                                                    <CLIInput
                                                        value={formData.dashboardFee}
                                                        onChange={(v) => setFormData({ ...formData, dashboardFee: v })}
                                                        placeholder={getFeePlaceholder(formData.dashboardFeeType)}
                                                        label={`--fee`}
                                                        error={errors.dashboardFee}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Real On-Chain Reward Settings */}
                                        <div className="space-y-4 pt-4 border-t border-white/5">
                                            <div className="flex items-center gap-2 mb-2 text-umkm-light font-mono text-sm">
                                                <span className="text-orange-400">*</span> Real On-Chain Tax & Rewards
                                            </div>

                                            <div className="p-4 rounded-xl border border-gray-800 bg-black/20 space-y-4">
                                                {/* Tax Type Selector */}
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-gray-400 font-mono">Pool Tax Structure</span>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData({ ...formData, taxType: 'dynamic' })}
                                                            className={`px-3 py-1.5 text-[10px] font-mono rounded-lg border transition-colors ${formData.taxType === 'dynamic' ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' : 'border-gray-800 text-gray-500 hover:border-gray-600'}`}
                                                        >
                                                            DYNAMIC (1-10%)
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData({ ...formData, taxType: 'static' })}
                                                            className={`px-3 py-1.5 text-[10px] font-mono rounded-lg border transition-colors ${formData.taxType === 'static' ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' : 'border-gray-800 text-gray-500 hover:border-gray-600'}`}
                                                        >
                                                            STATIC (CUSTOM%)
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Tax Percentage Slider */}
                                                {formData.taxType === 'static' && (
                                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="pt-2">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-xs font-mono text-gray-500">Static Tax</span>
                                                            <span className="text-xs font-mono font-bold text-orange-400">{formData.taxPercentage}%</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max="90"
                                                            step="0.1"
                                                            value={formData.taxPercentage}
                                                            onChange={(e) => setFormData({ ...formData, taxPercentage: parseFloat(e.target.value) })}
                                                            className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                                        />
                                                        <p className="mt-1 text-[10px] text-gray-500 font-mono text-right">0% - 90% Override</p>
                                                    </motion.div>
                                                )}

                                                {/* Real Reward Recipient */}
                                                <div className="pt-2">
                                                    <CLIInput
                                                        value={formData.rewardRecipient}
                                                        onChange={(v) => setFormData({ ...formData, rewardRecipient: v })}
                                                        placeholder="0x..."
                                                        label="--reward-target"
                                                        error={errors.rewardRecipient}
                                                    />
                                                    <p className="mt-1 text-[10px] text-orange-500/70 font-mono leading-tight">This address will securely receive ALL the actual protocol fees. The dashboard profile above is merely a visual spoof.</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Vanity Address */}
                                        <div className="space-y-4 pt-4 border-t border-white/5">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-orange-400 font-bold">✨</span>
                                                    <span className="text-umkm-light font-mono text-sm">Vanity Address </span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const newVal = !vanityEnabled;
                                                        setVanityEnabled(newVal);

                                                        // Instantly update the salt inside formData based on toggle
                                                        if (newVal) {
                                                            const randomPart = Array.from({ length: 61 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
                                                            setFormData(p => ({ ...p, salt: '0xba3' + randomPart }));
                                                        } else {
                                                            const fullRandom = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
                                                            setFormData(p => ({ ...p, salt: fullRandom }));
                                                        }
                                                    }}
                                                    className={`w-12 h-7 rounded-full transition-all duration-300 relative ${vanityEnabled ? 'bg-orange-500' : 'bg-gray-800 border-gray-700 border'}`}
                                                >
                                                    <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${vanityEnabled ? 'left-6' : 'left-1'}`} />
                                                </button>
                                            </div>

                                            <AnimatePresence>
                                                {vanityEnabled && (
                                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                                        <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl space-y-2">
                                                            <p className="text-xs font-mono text-orange-200">
                                                                AI Agent will enforce token creation with a customized <span className="font-bold text-orange-400">bA3</span> smart contract prefix via `CREATE2`.
                                                            </p>
                                                            <div className="flex justify-between items-center text-[10px] font-mono p-2 bg-black/40 rounded-lg border border-black/50">
                                                                <span className="text-gray-500">Salt</span>
                                                                <span className="text-orange-400/80 blur-[2px] hover:blur-none transition-all duration-300 cursor-help" title="Cryptographic Salt for CREATE2 Opcode">
                                                                    {formData.salt?.substring(0, 15)}...
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>

                                    <div className="pt-6">
                                        <CLIButton
                                            variant="primary"
                                            onClick={handleSubmit}
                                            fullWidth
                                            className="!bg-orange-500 hover:!bg-orange-600 shadow-orange-500/20"
                                            icon={<Rocket className="w-4 h-4" />}
                                        >
                                            Execute Launch Sequence
                                        </CLIButton>
                                        <p className="text-center text-[10px] font-mono text-gray-500 mt-3">
                                            Request will be processed by Bankr AI via x402 protocol ($0.10)
                                        </p>
                                    </div>
                                </motion.div>
                            )}

                            {step === 'processing' && (
                                <motion.div
                                    key="processing"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="py-12 space-y-4"
                                >
                                    <div className="flex justify-center mb-6">
                                        <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
                                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}>
                                                <Rocket className="w-8 h-8 text-orange-400" />
                                            </motion.div>
                                        </div>
                                    </div>
                                    <TerminalLoader text={loadingText} />
                                    <TerminalLine prefix=" " text="Do not close this window." type="warning" />
                                </motion.div>
                            )}

                            {step === 'success' && (
                                <motion.div
                                    key="success"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="space-y-4 py-8"
                                >
                                    <div className="flex justify-center mb-6">
                                        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${resultData?.deployedViaFallback ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                            <CheckCircle2 className="w-8 h-8" />
                                        </div>
                                    </div>

                                    <TerminalLine
                                        text={resultData?.deployedViaFallback ? "Token successfully launched via Clanker Fallback!" : "Launch successfully executed by Agent Bankr!"}
                                        type={resultData?.deployedViaFallback ? "warning" : "success"}
                                    />

                                    {resultData?.message && (
                                        <div className={`p-4 rounded-xl border font-mono text-sm whitespace-pre-wrap ${resultData?.deployedViaFallback
                                            ? 'bg-amber-500/5 border-amber-500/20 text-amber-200'
                                            : 'bg-umkm-light/5 border-umkm-light/10 text-gray-300'
                                            }`}>
                                            {resultData.message}
                                        </div>
                                    )}

                                    {resultData?.txHash && (
                                        <TerminalLine text={resultData?.deployedViaFallback ? `Deployment Tx: ${resultData.txHash}` : `Payment Tx: ${resultData.txHash}`} type="output" />
                                    )}

                                    <div className="pt-6">
                                        <CLIButton
                                            variant="secondary"
                                            onClick={() => {
                                                const newSalt = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
                                                setFormData({ name: '', symbol: '', image: '', tweet: '', cast: '', description: '', telegram: '', website: '', launcherType: 'x', launcher: '', dashboardFeeType: 'x', dashboardFee: '', taxType: 'dynamic', taxPercentage: 10, rewardRecipient: address || '', salt: newSalt });
                                                setVanityEnabled(false);
                                                setStep('form');
                                            }}
                                            fullWidth
                                        >
                                            Launch Another
                                        </CLIButton>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Terminal>
                </div>
            </main>
        </div>
    );
}
