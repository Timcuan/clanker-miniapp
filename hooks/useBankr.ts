import { useState, useCallback } from 'react';
import { useWallet } from '@/contexts/WalletContext';

export interface ChatMessage {
    id: string;
    role: 'user' | 'agent' | 'system';
    content: string;
    timestamp: Date;
    isError?: boolean;
    txHash?: string;
}

export function useBankr() {
    const { customRpcUrl } = useWallet();
    const [messages, setMessages] = useState<ChatMessage[]>([{
        id: 'welcome',
        role: 'agent',
        content: 'Hello! I am Agent Bankr. I can help you analyze markets, execute swaps, and interact with the blockchain. How can I assist you today?',
        timestamp: new Date()
    }]);
    const [isLoading, setIsLoading] = useState(false);

    const sendMessage = useCallback(async (prompt: string) => {
        if (!prompt.trim()) return;

        // 1. Add user message to UI immediately
        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: prompt,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setIsLoading(true);

        try {
            // 2. Call the API Route
            const response = await fetch('/api/bankr', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt,
                    customRpcUrl,
                }),
            });

            const data = await response.json();

            // 3. Handle response and add agent message
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to communicate with Bankr');
            }

            const agentMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'agent',
                // Depending on actual Bankr SDK return signature, adjust parsing here. 
                // For now, using standard message or stringified txData.
                content: data.message || (data.txData ? JSON.stringify(data.txData, null, 2) : 'Request completed.'),
                timestamp: new Date(),
                txHash: data.txData?.txHash || (data.error && data.error.includes('Payment Tx:') ? data.error.split('Payment Tx: ')[1] : undefined)
            };

            setMessages((prev) => [...prev, agentMessage]);

        } catch (error) {
            console.error('Bankr Error:', error);
            const errorMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'system',
                content: `Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}`,
                timestamp: new Date(),
                isError: true,
            };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    }, [customRpcUrl]);

    const clearChat = useCallback(() => {
        setMessages([{
            id: 'welcome',
            role: 'agent',
            content: 'Hello! I am Agent Bankr. I can help you analyze markets, execute swaps, and interact with the blockchain. How can I assist you today?',
            timestamp: new Date()
        }]);
    }, []);

    return {
        messages,
        isLoading,
        sendMessage,
        clearChat
    };
}
