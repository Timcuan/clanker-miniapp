'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { z } from 'zod';
import { Rocket, ArrowLeft, Image as ImageIcon, Twitter, Wallet, Hash, CheckCircle2, ChevronDown, UserSquare2 } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { CLIButton, CLIInput, StatusBadge } from '@/components/ui/CLIButton';
import { Terminal, TerminalLine, TerminalLoader, ResponsiveAscii } from '@/components/ui/Terminal';

// Schema mapping to `@bankr/cli` fields
const feeTypes = ['x', 'farcaster', 'ens', 'wallet'] as const;

export const bankrLaunchSchema = z.object({
    name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
    image: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    tweet: z.string().url('Must be a valid X/Twitter URL').optional().or(z.literal('')),
    launcherType: z.enum(feeTypes, { required_error: 'Launcher type is required' }),
    launcher: z.string().min(1, 'Launcher identity is required'),
    feeType: z.enum(feeTypes, { required_error: 'Fee type is required' }),
    fee: z.string().min(1, 'Fee recipient is required'),
});

type BankrLaunchFormParams = z.infer<typeof bankrLaunchSchema>;

export default function BankrLaunchPage() {
    const router = useRouter();
    const { isAuthenticated, formattedAddress } = useWallet();

    const [step, setStep] = useState<'form' | 'processing' | 'success'>('form');
    const [loadingText, setLoadingText] = useState('Initializing agent...');

    // Form State
    const [formData, setFormData] = useState<BankrLaunchFormParams>({
        name: '',
        image: '',
        tweet: '',
        launcherType: 'x',
        launcher: '',
        feeType: 'x',
        fee: '',
    });

    const [errors, setErrors] = useState<Partial<Record<keyof BankrLaunchFormParams, string>>>({});
    const [submitError, setSubmitError] = useState<string>('');
    const [resultData, setResultData] = useState<{ txHash?: string, message?: string, deployedViaFallback?: boolean } | null>(null);

    // Fee Type specific placeholders
    const getFeePlaceholder = (type: BankrLaunchFormParams['feeType']) => {
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
                                        {/* Name */}
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 mb-2 text-umkm-light font-mono text-sm">
                                                <span className="text-orange-400">*</span> Token Name
                                            </div>
                                            <CLIInput
                                                value={formData.name}
                                                onChange={(v) => setFormData({ ...formData, name: v })}
                                                placeholder="e.g. AI Protocol"
                                                label="--name"
                                                error={errors.name}
                                            />
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

                                        {/* Tweet */}
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 text-umkm-light font-mono text-sm">
                                                    <Twitter className="w-3.5 h-3.5 text-blue-400" /> Announcement Tweet <span className="text-[10px] text-gray-500">(Optional)</span>
                                                </div>
                                            </div>
                                            <CLIInput
                                                value={formData.tweet || ''}
                                                onChange={(v) => setFormData({ ...formData, tweet: v })}
                                                placeholder="https://x.com/user/status/123"
                                                label="--tweet"
                                                error={errors.tweet}
                                            />
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
                                                <span className="text-orange-400">*</span> Fee Distribution
                                            </div>

                                            <div className="flex flex-col sm:flex-row gap-3">
                                                {/* Fee Type Selector */}
                                                <div className="sm:w-1/3">
                                                    <div className="relative">
                                                        <select
                                                            value={formData.feeType}
                                                            onChange={(e) => setFormData({ ...formData, feeType: e.target.value as any })}
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
                                                        value={formData.fee}
                                                        onChange={(v) => setFormData({ ...formData, fee: v })}
                                                        placeholder={getFeePlaceholder(formData.feeType)}
                                                        label={`--fee`}
                                                        error={errors.fee}
                                                    />
                                                </div>
                                            </div>
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
                                                setFormData({ name: '', image: '', tweet: '', launcherType: 'x', launcher: '', feeType: 'x', fee: '' });
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
