'use client';

import { useState, useEffect, useCallback } from 'react';
import { Zap, RefreshCw, Check } from 'lucide-react';
import { hapticFeedback } from '@/lib/telegram/webapp';

export function RecoveryManager({ address, onRecovered }: { address: string, onRecovered: () => void }) {
    const [burners, setBurners] = useState<{ address: string; created_at: string; status: string; balance: string }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [recovering, setRecovering] = useState<string | null>(null);

    const fetchBurners = useCallback(async () => {
        try {
            setIsLoading(true);
            const r = await fetch('/api/bankr/recover');
            const d = await r.json();
            if (d.success) setBurners(d.burners);
        } catch (e) {
            console.error('Failed to fetch burners', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBurners();
    }, [fetchBurners]);

    const handleRecover = async (burnerAddr: string) => {
        try {
            setRecovering(burnerAddr);
            hapticFeedback('medium');
            const r = await fetch('/api/bankr/recover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: burnerAddr }),
            });
            const d = await r.json();
            if (d.success) {
                hapticFeedback('success');
                await fetchBurners();
                onRecovered();
            } else {
                alert(d.error || 'Recovery failed');
                hapticFeedback('error');
            }
        } catch (e) {
            console.error('Recovery error', e);
        } finally {
            setRecovering(null);
        }
    };

    if (burners.length === 0 && !isLoading) return null;

    return (
        <div className="mt-6 space-y-3">
            <h3 className="font-mono text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-bold px-1">Detected Stuck Funds</h3>
            <div className="space-y-2">
                {burners.map(b => (
                    <div key={b.address} className="p-3 rounded-xl border border-orange-200 dark:border-orange-500/20 bg-orange-50/30 dark:bg-orange-950/20 flex items-center justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <p className="font-mono text-[11px] text-gray-700 dark:text-gray-200 truncate">{b.address}</p>
                                {parseFloat(b.balance) > 0 && (
                                    <span className="shrink-0 font-mono text-[9px] font-bold text-orange-500 bg-orange-500/10 px-1 rounded-md flex items-center gap-0.5">
                                        <Zap className="w-2.5 h-2.5" />
                                        {parseFloat(b.balance).toFixed(4)} ETH
                                    </span>
                                )}
                            </div>
                            <p className="font-mono text-[9px] text-gray-400 dark:text-gray-500">Created: {new Date(b.created_at).toLocaleString()}</p>
                        </div>
                        <button
                            type="button"
                            disabled={recovering === b.address || parseFloat(b.balance) === 0}
                            onClick={() => handleRecover(b.address)}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-white font-mono text-[10px] font-bold uppercase hover:bg-orange-600 disabled:opacity-50 transition-all shadow-sm active:scale-95"
                        >
                            {recovering === b.address ? (
                                <>
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    Recovering...
                                </>
                            ) : (
                                <>
                                    <Check className="w-3 h-3" />
                                    Sweep ETH
                                </>
                            )}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
