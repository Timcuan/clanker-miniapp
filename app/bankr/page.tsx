'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, ArrowLeft, Send, Trash2, Cpu } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { StatusBadge } from '@/components/ui/CLIButton';
import { useBankr, ChatMessage } from '@/hooks/useBankr';
import { TerminalLine, TerminalLoader } from '@/components/ui/Terminal';

export default function BankrPage() {
    const router = useRouter();
    const { isAuthenticated, formattedAddress } = useWallet();
    const { messages, isLoading, sendMessage, clearChat } = useBankr();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of chat
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Protect route
    useEffect(() => {
        if (!isAuthenticated) {
            router.replace('/');
        }
    }, [isAuthenticated, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userPrompt = input;
        setInput(''); // Clear input eagerly
        await sendMessage(userPrompt);
    };

    if (!isAuthenticated) return null;

    return (
        <div className="h-[100dvh] flex flex-col bg-umkm-dark text-umkm-light relative overflow-hidden">

            {/* Background Matrix/Grid effect */}
            <div className="absolute inset-0 bg-[url('/matrix-bg.png')] opacity-5 pointer-events-none mix-blend-overlay" />

            {/* Header */}
            <header className="relative z-10 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between border-b border-umkm-primary/20 bg-umkm-dark/90 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="p-2 rounded-xl bg-umkm-primary/10 hover:bg-umkm-primary/20 text-umkm-primary transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                            <Cpu className="w-4 h-4 text-purple-400" />
                        </div>
                        <div>
                            <h1 className="font-display font-bold text-sm text-purple-400">Agent Bankr</h1>
                            <p className="font-mono text-[10px] text-gray-400">v2.9.0</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={clearChat}
                        className="p-2 rounded-xl hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
                        title="Clear Chat"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <StatusBadge status="online" text={formattedAddress || 'CONNECTED'} />
                </div>
            </header>

            {/* Chat Area */}
            <main className="flex-1 overflow-y-auto p-4 space-y-4 relative z-10 scrollbar-hide">
                <AnimatePresence initial={false}>
                    {messages.map((msg: ChatMessage) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.2 }}
                            className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[85%] rounded-2xl p-3 sm:p-4 ${msg.role === 'user'
                                    ? 'bg-umkm-primary/20 border border-umkm-primary/30 text-umkm-light'
                                    : msg.role === 'system'
                                        ? 'bg-red-500/10 border border-red-500/30 text-red-200'
                                        : 'bg-umkm-light/5 border border-umkm-light/10 text-gray-200'
                                    }`}
                            >
                                <div className="flex items-center gap-2 mb-1.5 opacity-60">
                                    {msg.role === 'agent' && <Bot className="w-3 h-3 text-purple-400" />}
                                    {msg.role === 'system' && <TerminalLine text="" type="error" className="w-3 h-3" />}
                                    <span className="font-mono text-[10px] uppercase tracking-wider">
                                        {msg.role}
                                    </span>
                                    <span className="font-mono text-[9px] ml-auto">
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                {/* Message Content */}
                                <div className="font-mono text-xs sm:text-sm whitespace-pre-wrap leading-relaxed break-words">
                                    {msg.content}
                                </div>

                                {/* Optional Metadata (like txHash) */}
                                {msg.txHash && (
                                    <div className="mt-3 pt-2 border-t border-white/10">
                                        <p className="font-mono text-[10px] text-gray-400 truncate">
                                            Tx: <a href={`https://basescan.org/tx/${msg.txHash}`} target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">{msg.txHash}</a>
                                        </p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}

                    {isLoading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex justify-start w-full"
                        >
                            <div className="bg-umkm-light/5 border border-umkm-light/10 rounded-2xl p-4 max-w-[80%]">
                                <TerminalLoader text="Agent analyzing and negotiating x402 payment..." />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </main>

            {/* Input Area */}
            <div className="relative z-10 p-3 sm:p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-umkm-primary/20 bg-umkm-dark/95 backdrop-blur-xl">
                <form onSubmit={handleSubmit} className="flex gap-2 max-w-4xl mx-auto">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask Bankr to swap tokens, analyze markets..."
                            disabled={isLoading}
                            className="w-full bg-black/40 border border-umkm-primary/30 rounded-xl px-4 py-3 sm:py-4 font-mono text-xs sm:text-sm text-umkm-light placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors disabled:opacity-50"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="bg-purple-500 hover:bg-purple-600 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-xl px-4 sm:px-6 flex items-center justify-center transition-colors shadow-lg shadow-purple-500/20 disabled:shadow-none"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </form>
                <p className="font-mono text-[9px] sm:text-[10px] text-center text-gray-500 mt-2 sm:mt-3">
                    Powered by Bankr v2. Requests may incur a $0.10 USDC x402 payment on Base.
                </p>
            </div>
        </div>
    );
}
