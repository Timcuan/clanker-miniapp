'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { z } from 'zod';
import { 
    Rocket, ArrowLeft, Image as ImageIcon, Twitter, 
    CheckCircle2, ChevronDown, ChevronUp, Clipboard, 
    Zap, ExternalLink, MessageCircle, Globe, Share2
} from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { CLIButton, StatusBadge } from '@/components/ui/CLIButton';
import { Terminal, TerminalLine, TerminalLoader } from '@/components/ui/Terminal';
import { hapticFeedback } from '@/lib/telegram/webapp';

// Schema mapping exactly to Bankr SDK expectations
const feeTypes = ['x', 'farcaster', 'ens', 'wallet'] as const;

const bankrLaunchSchema = z.object({
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
});

type BankrLaunchFormParams = z.infer<typeof bankrLaunchSchema>;

// Premium Mobile Input (Shared Design Pattern)
function MobileInput({
    label, value, onChange, placeholder, error, multiline = false, uppercase = false, hint, icon: Icon
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    error?: string;
    multiline?: boolean;
    uppercase?: boolean;
    hint?: string;
    icon?: any;
}) {
    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            onChange(uppercase ? text.toUpperCase() : text.trim());
            hapticFeedback('light');
        } catch (err) {
            console.error('Paste failed:', err);
        }
    };

    const inputClass = `w-full bg-white dark:bg-gray-900 border ${error ? 'border-red-300 dark:border-red-500/50 bg-red-50/10' : 'border-gray-200 dark:border-gray-800'} rounded-xl px-4 py-3 pr-12 font-mono text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all`;

    return (
        <div className="space-y-1.5">
            {label && (
                <label className="flex items-center gap-2 font-mono text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                    {Icon && <Icon className="w-3 h-3 text-orange-500/70" />}
                    <span className="text-orange-500 dark:text-orange-400 font-medium font-mono">--{label}</span>
                </label>
            )}
            <div className="relative">
                {multiline ? (
                    <textarea
                        value={value}
                        onChange={(e) => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
                        placeholder={placeholder}
                        rows={2}
                        className={inputClass + ' resize-none'}
                    />
                ) : (
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
                        placeholder={placeholder}
                        className={inputClass}
                    />
                )}
                <button
                    type="button"
                    onClick={handlePaste}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 transition-colors"
                >
                    <Clipboard className="w-4 h-4" />
                </button>
            </div>
            {(hint || error) && (
                <p className={`font-mono text-[10px] ${error ? 'text-red-500' : 'text-gray-400/80'}`}>
                    {error ? `Error: ${error}` : hint}
                </p>
            )}
        </div>
    );
}

// Custom Option Selector (Shared Design Pattern)
function OptionSelector({
    label, value, options, onChange, icons,
}: {
    label: string;
    value: string;
    options: string[];
    onChange: (v: string) => void;
    icons?: Record<string, any>;
}) {
    return (
        <div className="space-y-2">
            <label className="block font-mono text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                <span className="text-orange-500 font-medium">option</span> {label}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {options.map((opt) => {
                    const Icon = icons?.[opt];
                    const active = value === opt;
                    return (
                        <button
                            key={opt}
                            onClick={() => {
                                onChange(opt);
                                hapticFeedback('light');
                            }}
                            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border font-mono text-[10px] uppercase transition-all ${
                                active 
                                ? 'bg-orange-500/10 border-orange-500/50 text-orange-600 dark:text-orange-400 shadow-sm' 
                                : 'bg-white dark:bg-gray-950 border-gray-100 dark:border-gray-800 text-gray-400 hover:border-gray-200 dark:hover:border-gray-700'
                            }`}
                        >
                            {Icon && <Icon className={`w-3.5 h-3.5 ${active ? 'text-orange-500' : 'text-gray-400'}`} />}
                            {opt}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

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
    });

    const [vanityEnabled, setVanityEnabled] = useState(false);
    const [errors, setErrors] = useState<Partial<Record<keyof BankrLaunchFormParams, string>>>({});
    const [submitError, setSubmitError] = useState<string>('');
    const [resultData, setResultData] = useState<{ txHash?: string, message?: string, deployedViaFallback?: boolean } | null>(null);

    // Initial setup
    useEffect(() => {
        if (address && !formData.rewardRecipient) {
            setFormData(prev => ({ ...prev, rewardRecipient: address }));
        }
    }, [address]);

    const getFeePlaceholder = (type: BankrLaunchFormParams['dashboardFeeType']) => {
        switch (type) {
            case 'x': return '@username';
            case 'farcaster': return '@username';
            case 'ens': return 'vitalik.eth';
            case 'wallet': return '0x...';
        }
    };

    const handleValidation = () => {
        try {
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
                hapticFeedback('error');
            }
            return false;
        }
    };

    const handleSubmit = async () => {
        if (!handleValidation()) return;

        setStep('processing');
        setSubmitError('');
        hapticFeedback('medium');

        try {
            setLoadingText('Securing x402 payment channel...');
            await new Promise(r => setTimeout(r, 800));

            setLoadingText('Negotiating with Bankr Agent...');

            const response = await fetch('/api/bankr/launch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to launch token via Bankr');
            }

            setResultData(data);
            setStep('success');
            hapticFeedback('success');

        } catch (error) {
            console.error('Bankr Launch Error:', error);
            setSubmitError(error instanceof Error ? error.message : 'Unknown error occurred');
            setStep('form');
            hapticFeedback('error');
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="h-[100dvh] flex items-center justify-center p-4 bg-white dark:bg-gray-950">
                <Terminal title="auth-error">
                    <TerminalLine text="Unauthorized access. Wallet not connected." type="error" />
                    <CLIButton variant="secondary" onClick={() => router.push('/')} className="mt-4">Return Home</CLIButton>
                </Terminal>
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-300">
            {/* Header */}
            <header className="relative z-10 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between border-b border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="p-2 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:text-orange-500 transition-all"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 dark:bg-orange-500/20 flex items-center justify-center border border-orange-500/20">
                            <Rocket className="w-4 h-4 text-orange-500" />
                        </div>
                        <div>
                            <h1 className="font-display font-bold text-sm text-gray-900 dark:text-white">Bankr Launch</h1>
                            <p className="font-mono text-[10px] text-gray-500">Agent-driven Engine</p>
                        </div>
                    </div>
                </div>

                <StatusBadge status="online" text={formattedAddress || ''} />
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto px-4 py-6 relative z-10 scrollbar-hide pb-24 max-w-2xl mx-auto w-full">
                <AnimatePresence mode="wait">
                    {step === 'form' && (
                        <motion.div
                            key="form"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-6"
                        >
                            <section className="p-4 rounded-2xl bg-orange-50/50 dark:bg-orange-500/5 border border-orange-100 dark:border-orange-500/10">
                                <p className="font-mono text-xs text-orange-700 dark:text-orange-400 leading-relaxed">
                                    <span className="font-bold">NOTE:</span> This mode utilizes the Bankr AI Agent for autonomous deployment and indexing. Ensure metadata is accurate for optimal agent performance.
                                </p>
                            </section>

                            {submitError && (
                                <motion.div 
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="p-4 rounded-xl bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20 flex gap-3 text-red-600 dark:text-red-400"
                                >
                                    <Rocket className="w-5 h-5 flex-shrink-0 rotate-180" />
                                    <div className="font-mono text-xs leading-relaxed">Launch Failed: {submitError}</div>
                                </motion.div>
                            )}

                            {/* Core Config */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <MobileInput
                                    label="name"
                                    value={formData.name}
                                    onChange={(v) => setFormData({ ...formData, name: v })}
                                    placeholder="AI Protocol"
                                    error={errors.name}
                                />
                                <MobileInput
                                    label="symbol"
                                    value={formData.symbol}
                                    onChange={(v) => setFormData({ ...formData, symbol: v.toUpperCase() })}
                                    placeholder="AIP"
                                    uppercase
                                    error={errors.symbol}
                                />
                            </div>

                            <MobileInput
                                label="image"
                                value={formData.image || ''}
                                onChange={(v) => setFormData({ ...formData, image: v })}
                                placeholder="ipfs://... or https://..."
                                icon={ImageIcon}
                                error={errors.image}
                            />

                            <MobileInput
                                label="description"
                                value={formData.description || ''}
                                onChange={(v) => setFormData({ ...formData, description: v })}
                                placeholder="A revolutionary new protocol..."
                                multiline
                                error={errors.description}
                            />

                            {/* Socials Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                <MobileInput
                                    label="tweet"
                                    value={formData.tweet || ''}
                                    onChange={(v) => setFormData({ ...formData, tweet: v })}
                                    placeholder="https://x.com/..."
                                    icon={Twitter}
                                    error={errors.tweet}
                                />
                                <MobileInput
                                    label="warpcast"
                                    value={formData.cast || ''}
                                    onChange={(v) => setFormData({ ...formData, cast: v })}
                                    placeholder="https://warpcast.com/..."
                                    icon={Share2}
                                    error={errors.cast}
                                />
                                <MobileInput
                                    label="telegram"
                                    value={formData.telegram || ''}
                                    onChange={(v) => setFormData({ ...formData, telegram: v })}
                                    placeholder="https://t.me/..."
                                    icon={MessageCircle}
                                    error={errors.telegram}
                                />
                                <MobileInput
                                    label="website"
                                    value={formData.website || ''}
                                    onChange={(v) => setFormData({ ...formData, website: v })}
                                    placeholder="https://..."
                                    icon={Globe}
                                    error={errors.website}
                                />
                            </div>

                            {/* Identity Settings */}
                            <div className="space-y-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                                <OptionSelector
                                    label="launcher_identity"
                                    value={formData.launcherType}
                                    options={['x', 'farcaster', 'ens', 'wallet']}
                                    onChange={(v) => setFormData({ ...formData, launcherType: v as any })}
                                    icons={{ x: Twitter, farcaster: Share2, ens: Globe, wallet: Rocket }}
                                />
                                <MobileInput
                                    label="id_handle"
                                    value={formData.launcher}
                                    onChange={(v) => setFormData({ ...formData, launcher: v })}
                                    placeholder={getFeePlaceholder(formData.launcherType)}
                                    error={errors.launcher}
                                />
                            </div>

                            <div className="space-y-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                                <OptionSelector
                                    label="fee_distribution_profile"
                                    value={formData.dashboardFeeType}
                                    options={['x', 'farcaster', 'ens', 'wallet']}
                                    onChange={(v) => setFormData({ ...formData, dashboardFeeType: v as any })}
                                    icons={{ x: Twitter, farcaster: Share2, ens: Globe, wallet: Rocket }}
                                />
                                <MobileInput
                                    label="fee_handle"
                                    value={formData.dashboardFee}
                                    onChange={(v) => setFormData({ ...formData, dashboardFee: v })}
                                    placeholder={getFeePlaceholder(formData.dashboardFeeType)}
                                    error={errors.dashboardFee}
                                    hint="This handle is displayed on the Clanker dashboard as the interface fee recipient."
                                />
                            </div>

                            {/* Technicals */}
                            <div className="space-y-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 space-y-5">
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-xs text-gray-500">Tax Type</span>
                                        <div className="flex gap-2">
                                            {['dynamic', 'static'].map(t => (
                                                <button
                                                    key={t}
                                                    onClick={() => setFormData({ ...formData, taxType: t as any })}
                                                    className={`px-3 py-1.5 rounded-lg border font-mono text-[10px] uppercase transition-all ${
                                                        formData.taxType === t 
                                                        ? 'bg-orange-500 text-white border-orange-500 shadow-sm' 
                                                        : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-500'
                                                    }`}
                                                >
                                                    {t}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {formData.taxType === 'static' && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="font-mono text-[10px] text-gray-500">Static Percent</span>
                                                <span className="font-mono text-xs font-bold text-orange-500">{formData.taxPercentage}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0"
                                                max="90"
                                                step="0.1"
                                                value={formData.taxPercentage}
                                                onChange={(e) => setFormData({ ...formData, taxPercentage: parseFloat(e.target.value) })}
                                                className="w-full h-1.5 bg-gray-200 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                            />
                                        </motion.div>
                                    )}

                                    <MobileInput
                                        label="onchain_recipient"
                                        value={formData.rewardRecipient}
                                        onChange={(v) => setFormData({ ...formData, rewardRecipient: v })}
                                        placeholder="0x..."
                                        error={errors.rewardRecipient}
                                        hint="Final recipient of real on-chain fees."
                                    />
                                </div>

                                <div className="flex justify-between items-center p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                                    <div className="flex items-center gap-2">
                                        <Zap className={`w-4 h-4 ${vanityEnabled ? 'text-orange-500' : 'text-gray-400'}`} />
                                        <span className="font-mono text-xs text-gray-700 dark:text-gray-300 font-medium">Vanity Prefix (bA3)</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const newVal = !vanityEnabled;
                                            setVanityEnabled(newVal);
                                            hapticFeedback('medium');
                                            if (newVal) {
                                                const randomPart = Array.from({ length: 61 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
                                                setFormData(p => ({ ...p, salt: '0xba3' + randomPart }));
                                            }
                                        }}
                                        className={`w-12 h-6 rounded-full transition-all relative ${vanityEnabled ? 'bg-orange-500 shadow-md' : 'bg-gray-200 dark:bg-gray-800'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${vanityEnabled ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>

                            <CLIButton
                                variant="primary"
                                onClick={handleSubmit}
                                fullWidth
                                size="lg"
                                className="!bg-orange-500 hover:!bg-orange-600 shadow-lg shadow-orange-500/20 group"
                                icon={<Rocket className="w-5 h-5 group-hover:animate-bounce" />}
                            >
                                Execute Launch Sequence
                            </CLIButton>
                        </motion.div>
                    )}

                    {step === 'processing' && (
                        <motion.div
                            key="processing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center py-20 px-4"
                        >
                            <Terminal className="w-full max-w-sm">
                                <div className="flex justify-center py-8">
                                    <motion.div 
                                        animate={{ rotate: 360 }} 
                                        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                                        className="relative"
                                    >
                                        <div className="absolute inset-0 blur-xl bg-orange-500/30 rounded-full" />
                                        <Rocket className="w-12 h-12 text-orange-500 relative z-10" />
                                    </motion.div>
                                </div>
                                <TerminalLoader text={loadingText} />
                                <div className="mt-6 flex flex-col gap-2">
                                    <TerminalLine text="Contacting Bankr AI Agent..." type="info" />
                                    <TerminalLine text="Bypassing deployment limits..." type="command" />
                                    <TerminalLine text="Awaiting confirmation..." type="output" />
                                </div>
                            </Terminal>
                        </motion.div>
                    )}

                    {step === 'success' && (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center py-12 px-4"
                        >
                            <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 mb-8 shadow-lg shadow-emerald-500/10">
                                <CheckCircle2 className="w-10 h-10" />
                            </div>
                            
                            <h2 className="text-xl font-display font-bold text-gray-900 dark:text-white mb-2 text-center">Deployment Successful</h2>
                            <p className="font-mono text-xs text-gray-500 text-center mb-8">Token has been launched and submitted for indexing.</p>

                            <Terminal className="w-full mb-8">
                                <TerminalLine text="Agent Bankr: Mission accomplished." type="success" />
                                <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 mt-2 font-mono text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
                                    {resultData?.message || "Deployment parameters confirmed. Social links and metadata have been successfully bound to the smart contract."}
                                </div>
                                {resultData?.txHash && (
                                    <div className="mt-4 flex items-center justify-between p-3 bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-xl">
                                        <span className="font-mono text-[10px] text-gray-400">Transaction</span>
                                        <a 
                                            href={`https://basescan.org/tx/${resultData.txHash}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="font-mono text-[10px] text-orange-500 flex items-center gap-1 hover:underline"
                                        >
                                            View on Scan <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                )}
                            </Terminal>

                            <CLIButton
                                variant="secondary"
                                onClick={() => setStep('form')}
                                fullWidth
                                icon={<Share2 className="w-4 h-4" />}
                            >
                                Launch Another Token
                            </CLIButton>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}
