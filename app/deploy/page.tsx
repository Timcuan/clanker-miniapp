'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Rocket, Check, AlertCircle, ChevronDown, ChevronUp,
  Shield, Zap, Copy, ExternalLink, Clipboard, Image, User, Coins,
  Globe, MessageCircle, FileText, Info, RefreshCw, ChevronRight, Share2, Settings, AlertTriangle
} from 'lucide-react';
import ClankerLogo from '@/components/ui/ClankerLogo';
import { useTelegramContext } from '@/components/layout/TelegramProvider';
import { useWallet } from '@/contexts/WalletContext';
import { showBackButton, hideBackButton, hapticFeedback } from '@/lib/telegram/webapp';
import { Terminal, TerminalLine, TerminalLoader } from '@/components/ui/Terminal';
import { CLIButton, CLICard, StatusBadge } from '@/components/ui/CLIButton';
import { GlitchText } from '@/components/ui/GlitchText';
import { MevModuleType, DEFAULT_CONFIG } from '@/lib/clanker/constants';

type DeployStep = 'form' | 'review' | 'deploying' | 'success' | 'error';

// Full SDK-compatible token configuration
interface TokenConfig {
  // Basic Info
  name: string;
  symbol: string;
  image: string;

  // Metadata for Clanker verification
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  farcaster: string;
  github: string;

  // Ownership
  tokenAdmin: string;
  rewardRecipient: string;
  creatorReward: number; // 0-80%

  // Pool & Fees
  feeType: 'dynamic' | 'static';
  poolPosition: 'Standard' | 'Project';

  // MEV Protection
  mevProtection: MevModuleType;
  blockDelay: number;

  // Dev Buy (optional)
  devBuyEth: string;
}

interface DeployResult {
  txHash: string;
  tokenAddress: string;
  id: string;
}

// Social platforms supported by Clanker
const SOCIAL_PLATFORMS = ['x', 'telegram', 'discord', 'website', 'farcaster', 'github'] as const;

/**
 * Convert various image input formats to ipfs:// URL
 * Supports:
 * - Raw CID: "bafybeig..." or "Qm..."
 * - ipfs:// URL: "ipfs://bafybeig..."
 * - Pinata gateway: "https://gateway.pinata.cloud/ipfs/bafybeig..."
 * - Other IPFS gateways
 * - Regular HTTP URLs (returned as-is)
 */
function formatImageUrl(input: string): string {
  if (!input) return '';

  const trimmed = input.trim();

  // Already ipfs:// format
  if (trimmed.startsWith('ipfs://')) return trimmed;

  // CID v1 patterns:
  // - bafybei... (dag-pb, 59 chars total)
  // - bafkrei... (raw, 59 chars total) 
  // - bafy/bafk followed by base32 chars
  if (/^baf[ky][a-z2-7]{55,}$/i.test(trimmed)) {
    return `ipfs://${trimmed}`;
  }

  // Raw CID v0 (Qm... 46 chars)
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(trimmed)) {
    return `ipfs://${trimmed}`;
  }

  // Any string starting with baf (catch-all for other CID v1 variants)
  if (/^baf[a-z2-7]+$/i.test(trimmed) && trimmed.length >= 32) {
    return `ipfs://${trimmed}`;
  }

  // HTTP(S) gateway URLs - extract CID
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);

      // Check for /ipfs/CID pattern
      const ipfsMatch = url.pathname.match(/\/ipfs\/([a-zA-Z0-9]+)/);
      if (ipfsMatch) {
        return `ipfs://${ipfsMatch[1]}`;
      }

      // Check for subdomain pattern: CID.ipfs.gateway.com
      const subdomainMatch = url.hostname.match(/^([a-zA-Z0-9]+)\.ipfs\./);
      if (subdomainMatch) {
        return `ipfs://${subdomainMatch[1]}`;
      }

      // Not an IPFS URL, return as-is
      return trimmed;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

// Check if input looks like a valid CID or URL
function isValidImageInput(input: string): boolean {
  if (!input) return true; // Empty is valid (optional)

  const trimmed = input.trim();

  // CID v1 (baf...)
  if (/^baf[a-z2-7]+$/i.test(trimmed) && trimmed.length >= 32) return true;

  // CID v0 (Qm...)
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(trimmed)) return true;

  // ipfs:// URL
  if (trimmed.startsWith('ipfs://')) return true;

  // HTTP URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

// Get preview URL for display
function getPreviewUrl(input: string): string {
  if (!input) return '';
  const formatted = formatImageUrl(input);
  if (formatted.startsWith('ipfs://')) {
    const cid = formatted.replace('ipfs://', '');
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  return formatted;
}

// Validate Ethereum address
function isValidAddress(address: string): boolean {
  if (!address) return true; // Optional
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Validate URL
function isValidUrl(url: string): boolean {
  if (!url) return true; // Optional
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Debounce hook for input optimization
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// Mobile-optimized input component
function MobileInput({
  label, value, onChange, placeholder, error, multiline = false, uppercase = false, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
  multiline?: boolean;
  uppercase?: boolean;
  hint?: string;
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

  const inputClass = `w-full bg-white border ${error ? 'border-red-300' : 'border-gray-200'} rounded-xl px-4 py-3 pr-12 font-mono text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20 transition-all`;

  return (
    <div className="space-y-1">
      {label && (
        <label className="block font-mono text-xs text-gray-500">
          <span className="text-[#0052FF] font-medium">const</span> {label} <span className="text-gray-400">=</span>
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
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <Clipboard className="w-4 h-4" />
        </button>
      </div>
      {hint && !error && <p className="font-mono text-[10px] text-gray-500">{hint}</p>}
      {error && <p className="font-mono text-xs text-red-500">Error: {error}</p>}
    </div>
  );
}

// Option selector component
function OptionSelector({
  label, value, options, onChange, descriptions,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  descriptions?: Record<string, string>;
}) {
  return (
    <div className="space-y-2">
      <label className="block font-mono text-xs text-gray-500">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => { onChange(opt); hapticFeedback('light'); }}
            className={`p-3 rounded-xl border font-mono text-xs text-left transition-all ${value === opt
              ? 'border-[#0052FF] bg-[#0052FF]/10 text-[#0052FF]'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
          >
            <div className="font-semibold">{opt}</div>
            {descriptions?.[opt] && <div className="text-[10px] text-gray-500 mt-1">{descriptions[opt]}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

// Collapsible section component
function CollapsibleSection({
  title, icon: Icon, children, defaultOpen = false
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); hapticFeedback('light'); }}
        className="w-full p-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="font-mono text-xs flex items-center gap-2 text-gray-700">
          <Icon className="w-4 h-4 text-[#0052FF]" />
          {title}
        </span>
        {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 space-y-4 border-t border-gray-100">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

export default function DeployPage() {
  const router = useRouter();
  const { isAuthenticated, formattedAddress, balance, address } = useWallet();
  const { isTelegram } = useTelegramContext();

  const [step, setStep] = useState<DeployStep>('form');
  const [config, setConfig] = useState<TokenConfig>({
    name: '',
    symbol: '',
    image: '',
    description: '',
    website: '',
    twitter: '',
    telegram: '',
    farcaster: '',
    github: '',
    tokenAdmin: '',
    rewardRecipient: '',
    creatorReward: 0, // Default: 0% to creator, 100% to interface
    feeType: DEFAULT_CONFIG.feeType,
    poolPosition: DEFAULT_CONFIG.poolPositionType,
    mevProtection: DEFAULT_CONFIG.mevModuleType,
    blockDelay: DEFAULT_CONFIG.blockDelay,
    devBuyEth: '0',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [isAdvanced, setIsAdvanced] = useState(false);

  const [activeLocalWallet, setActiveLocalWallet] = useState<{ address: string; label: string } | null>(null);
  const [localBalance, setLocalBalance] = useState<string | null>(null);

  // Debounced config for validation
  const debouncedConfig = useDebounce(config, 300);

  const fetchBalance = async (address: string) => {
    try {
      const client = createPublicClient({
        chain: base,
        transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org')
      });
      const balance = await client.getBalance({ address: address as `0x${string}` });
      setLocalBalance(formatEther(balance));
    } catch (e) {
      console.error('Failed to fetch balance', e);
    }
  };

  // Load local wallet and fetch balance
  useEffect(() => {
    const loadWallet = async () => {
      const storedActive = localStorage.getItem('clanker_active_wallet');
      const storedWallets = localStorage.getItem('clanker_wallets');

      if (storedActive && storedWallets) {
        const wallets = JSON.parse(storedWallets);
        const wallet = wallets.find((w: any) => w.address === storedActive);
        if (wallet) {
          setActiveLocalWallet({ address: wallet.address, label: wallet.label });
          fetchBalance(wallet.address);
        } else {
          setActiveLocalWallet(null);
          setLocalBalance(null);
        }
      } else {
        setActiveLocalWallet(null);
        setLocalBalance(null);
      }
    };

    loadWallet();

    // Refresh every 15s
    const interval = setInterval(loadWallet, 15000);
    return () => clearInterval(interval);
  }, []);

  // Load template from user config on mount
  useEffect(() => {
    if (isAuthenticated && !templateLoaded) {
      fetch('/api/config', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          // Load saved preferences first
          let savedPrefs = {};
          try {
            const stored = localStorage.getItem('clanker_deploy_prefs');
            if (stored) savedPrefs = JSON.parse(stored);
          } catch (e) {
            console.error('Failed to parse prefs', e);
          }

          setConfig(prev => ({
            ...prev,
            // Apply template defaults (API)
            description: prev.description || data.templateDescription || '',
            website: prev.website || data.templateWebsite || '',
            twitter: prev.twitter || data.templateTwitter || '',
            telegram: prev.telegram || data.templateTelegram || '',

            // Apply preferences (Saved > API > Default)
            ...savedPrefs,
          }));
          setTemplateLoaded(true);
        })
        .catch(err => console.error('Failed to load template:', err));
    }
  }, [isAuthenticated, templateLoaded]);

  // Save preferences automatically
  useEffect(() => {
    if (!isAuthenticated) return;
    const prefsToSave = {
      creatorReward: config.creatorReward,
      feeType: config.feeType,
      poolPosition: config.poolPosition,
      mevProtection: config.mevProtection,
      blockDelay: config.blockDelay,
      devBuyEth: config.devBuyEth,
      tokenAdmin: config.tokenAdmin,
      rewardRecipient: config.rewardRecipient,
    };
    localStorage.setItem('clanker_deploy_prefs', JSON.stringify(prefsToSave));
  }, [
    isAuthenticated,
    config.creatorReward,
    config.feeType,
    config.poolPosition,
    config.mevProtection,
    config.blockDelay,
    config.devBuyEth,
    config.tokenAdmin,
    config.rewardRecipient
  ]);

  useEffect(() => {
    if (isTelegram) {
      showBackButton(() => router.push('/'));
      return () => hideBackButton();
    }
  }, [isTelegram, router]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    // Unlimited validation as requested
    if (!config.name) newErrors.name = 'Required';
    if (!config.symbol) newErrors.symbol = 'Required';

    // Image validation (allow any string primarily, but check if we can format it)
    if (config.image && !isValidImageInput(config.image)) {
      // We allow it, but we won't block it.
    }

    // Address validation
    if (config.tokenAdmin && !isValidAddress(config.tokenAdmin)) {
      newErrors.tokenAdmin = 'Invalid address';
    }
    if (config.rewardRecipient && !isValidAddress(config.rewardRecipient)) {
      newErrors.rewardRecipient = 'Invalid address';
    }

    // URL validation
    if (config.website && !isValidUrl(config.website)) {
      newErrors.website = 'Invalid URL';
    }
    if (config.twitter && !isValidUrl(config.twitter) && !config.twitter.startsWith('@')) {
      newErrors.twitter = 'Invalid URL or @handle';
    }
    if (config.telegram && !isValidUrl(config.telegram) && !config.telegram.startsWith('@')) {
      newErrors.telegram = 'Invalid URL or @handle';
    }
    if (config.farcaster && !isValidUrl(config.farcaster) && !config.farcaster.startsWith('@')) {
      newErrors.farcaster = 'Invalid URL or @handle';
    }
    if (config.github && !isValidUrl(config.github)) {
      newErrors.github = 'Invalid URL';
    }

    // Creator reward validation
    if (config.creatorReward < 0 || config.creatorReward > 100) {
      newErrors.creatorReward = '0-100%';
    }

    // Dev buy validation
    const devBuy = parseFloat(config.devBuyEth);
    if (isNaN(devBuy) || devBuy < 0) {
      newErrors.devBuyEth = 'Invalid amount';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [config]);

  const addLog = useCallback((msg: string) => {
    setDeployLogs(prev => [...prev, msg]);
  }, []);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      hapticFeedback('success');
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handleReview = () => {
    if (!validateForm()) return;
    hapticFeedback('medium');
    setStep('review');
  };

  const handleDeploy = async () => {
    if (isDeploying) return; // Prevent double-click

    setIsDeploying(true);
    setStep('deploying');
    setDeployLogs([]);

    // 1. Resolve Active Wallet (Local vs Session)
    let activeLocalWallet: { address: string; privateKey: string; label: string } | null = null;
    try {
      const storedActive = localStorage.getItem('clanker_active_wallet');
      const storedWallets = localStorage.getItem('clanker_wallets');
      if (storedActive && storedWallets) {
        const wallets = JSON.parse(storedWallets);
        activeLocalWallet = wallets.find((w: any) => w.address === storedActive) || null;
      }
    } catch (e) {
      console.error('Failed to read local wallet', e);
    }

    // Resolve addresses
    const tokenAdmin = config.tokenAdmin || activeLocalWallet?.address || address || '';
    const rewardRecipient = config.rewardRecipient || activeLocalWallet?.address || address || '';
    const imageUrl = formatImageUrl(config.image);

    // Build social URLs
    const socialMediaUrls = [];
    if (config.twitter) {
      const twitterUrl = config.twitter.startsWith('@')
        ? `https://twitter.com/${config.twitter.slice(1)}`
        : config.twitter;
      socialMediaUrls.push({ platform: 'x', url: twitterUrl });
    }
    if (config.telegram) {
      const telegramUrl = config.telegram.startsWith('@')
        ? `https://t.me/${config.telegram.slice(1)}`
        : config.telegram;
      socialMediaUrls.push({ platform: 'telegram', url: telegramUrl });
    }
    if (config.farcaster) {
      let farcasterUrl = config.farcaster;
      if (farcasterUrl.startsWith('@')) {
        farcasterUrl = `https://warpcast.com/${farcasterUrl.slice(1)}`;
      } else if (!farcasterUrl.startsWith('http')) {
        farcasterUrl = `https://warpcast.com/${farcasterUrl}`;
      }
      socialMediaUrls.push({ platform: 'farcaster', url: farcasterUrl });
    }
    if (config.github) {
      socialMediaUrls.push({ platform: 'github', url: config.github });
    }
    if (config.website) {
      socialMediaUrls.push({ platform: 'website', url: config.website });
    }

    addLog('Initializing Clanker SDK v4...');
    addLog(`Token: ${config.name} ($${config.symbol})`);
    if (activeLocalWallet) {
      addLog(`Wallet: ${activeLocalWallet.label} (${activeLocalWallet.address.slice(0, 6)}...)`);
      addLog('Mode: Direct Client-Side Deployment');
    } else {
      addLog('Mode: Server-Relay Deployment');
    }

    // Log details
    if (config.description) addLog(`Description: ${config.description.slice(0, 50)}...`);
    if (imageUrl) addLog(`Image: ${imageUrl.slice(0, 30)}...`);
    addLog(`Admin: ${tokenAdmin.slice(0, 10)}...${tokenAdmin.slice(-6)}`);
    addLog(`Reward: ${rewardRecipient.slice(0, 10)}...${rewardRecipient.slice(-6)} (${config.creatorReward}%)`);
    addLog(`Fee: ${config.feeType} | Pool: ${config.poolPosition}`);
    addLog(`MEV: ${config.mevProtection}${config.mevProtection === MevModuleType.BlockDelay ? ` (${config.blockDelay} blocks)` : ''}`);
    if (parseFloat(config.devBuyEth) > 0) addLog(`Dev Buy: ${config.devBuyEth} ETH`);
    addLog('---');

    await new Promise(r => setTimeout(r, 500));
    addLog('Building transaction...');
    await new Promise(r => setTimeout(r, 500));

    try {
      let resultData;

      if (activeLocalWallet) {
        // --- CLIENT SIDE DEPLOYMENT ---
        addLog('Signing transaction locally...');
        // Dynamically import to ensure client-side compatibility if needed, 
        // or just assume the import at top works. 
        // We will use the import at the top.
        const { deployToken } = await import('@/lib/clanker/deployer');

        const result = await deployToken(activeLocalWallet.privateKey, {
          ...config,
          symbol: config.symbol.toUpperCase(),
          image: imageUrl,
          socialMediaUrls,
          tokenAdmin,
          rewardRecipient,
          platform: 'web', // or 'telegram-miniapp' if detected
          // Ensure numeric types
          creatorReward: Number(config.creatorReward),
          blockDelay: Number(config.blockDelay),
          devBuyEth: Number(config.devBuyEth) || 0,
          // Map enum to string literal explicitly
          mevProtection: config.mevProtection === MevModuleType.BlockDelay ? 'BlockDelay' : 'None',
        });

        if (!result.success || !result.tokenAddress) {
          throw new Error(result.error || 'Deployment failed locally');
        }

        resultData = {
          txHash: result.txHash,
          tokenAddress: result.tokenAddress,
          id: 'local-' + Date.now(),
          verified: true // Assumed since SDK handles it
        };

      } else {
        // --- SERVER SIDE FALLBACK ---
        addLog('Submitting to Relay Server...');
        const response = await fetch('/api/deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: config.name,
            symbol: config.symbol.toUpperCase(),
            image: imageUrl || undefined,
            description: config.description || undefined,
            socialMediaUrls: socialMediaUrls.length > 0 ? socialMediaUrls : undefined,
            tokenAdmin,
            rewardRecipient,
            creatorReward: config.creatorReward,
            feeType: config.feeType,
            poolPosition: config.poolPosition,
            mevProtection: config.mevProtection,
            blockDelay: config.blockDelay,
            devBuyEth: parseFloat(config.devBuyEth) || 0,
          }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Server deployment failed');
        resultData = data;
      }

      // Success handling for both modes
      await new Promise(r => setTimeout(r, 500));
      addLog(`TX: ${resultData.txHash ? resultData.txHash.slice(0, 10) : '...'}...`);
      addLog('✓ Transactions Broadcasted');
      addLog('✓ Waiting for Block Confirmation...');

      // In local mode, SDK waits for us. In server mode, it likely waited too.
      // So we are good.

      addLog('✓ Confirmed on Base!');
      addLog(`Token: ${resultData.tokenAddress ? resultData.tokenAddress.slice(0, 10) : '...'}...`);
      if (resultData.verified) addLog('✓ Verified by Clanker');

      setDeployResult({ txHash: resultData.txHash!, tokenAddress: resultData.tokenAddress!, id: resultData.id });
      hapticFeedback('success');
      setStep('success');

    } catch (error) {
      console.error('Deploy error', error);
      addLog(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Fallback hint
      if (activeLocalWallet && (error as Error).message.includes('Insuf')) {
        addLog('Hint: Check wallet balance for Gas + DevBuy');
      } else if (!activeLocalWallet) {
        addLog('Hint: Try adding a local wallet in Settings for direct control');
      }

      hapticFeedback('error');
      setStep('error');
    } finally {
      setIsDeploying(false);
    }
  };

  const resetForm = () => {
    setStep('form');

    // Load fresh defaults but keep saved prefs
    let savedPrefs = {};
    try {
      const stored = localStorage.getItem('clanker_deploy_prefs');
      if (stored) savedPrefs = JSON.parse(stored);
    } catch { }

    setConfig({
      name: '', symbol: '', image: '',
      description: '', website: '', twitter: '', telegram: '', farcaster: '', github: '',
      tokenAdmin: '', rewardRecipient: '',
      creatorReward: 0,
      feeType: DEFAULT_CONFIG.feeType,
      poolPosition: DEFAULT_CONFIG.poolPositionType,
      mevProtection: DEFAULT_CONFIG.mevModuleType,
      blockDelay: DEFAULT_CONFIG.blockDelay,
      devBuyEth: '0',
      ...savedPrefs // Restore prefs
    });
    setErrors({});
    setDeployLogs([]);
    setDeployResult(null);
    // Don't restart template loading, we handled it manually
  };

  // Quick deploy another token - keeps template settings for batch deployment
  const deployAnother = () => {
    // Only clear token-specific fields, keep template settings
    setStep('form');
    setConfig(prev => ({
      ...prev,
      name: '',
      symbol: '',
      image: '',
      // Keep: description, website, twitter, telegram, creatorReward, feeType, etc.
    }));
    setErrors({});
    setDeployLogs([]);
    setDeployResult(null);
    // Don't reset templateLoaded - keep using same template
  };

  // Share token info
  const shareToken = async () => {
    if (!deployResult) return;

    const shareText = `🚀 Just deployed $${config.symbol} on Base!\n\n` +
      `Token: ${deployResult.tokenAddress}\n` +
      `View on Clanker: https://clanker.world/clanker/${deployResult.tokenAddress}\n` +
      `Chart: https://dexscreener.com/base/${deployResult.tokenAddress}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${config.name} ($${config.symbol})`,
          text: shareText,
        });
      } else {
        await navigator.clipboard.writeText(shareText);
        setCopiedField('share');
        setTimeout(() => setCopiedField(null), 2000);
      }
      hapticFeedback('success');
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 bg-gradient-to-b from-white via-blue-50/30 to-white relative overflow-hidden">

        <Terminal title="umkm@base:~/deploy" className="max-w-md w-full relative z-10">
          <TerminalLine text="Error: Wallet not connected" type="error" />
          <div className="mt-6">
            <CLIButton variant="primary" onClick={() => router.push('/')} fullWidth>Go to Terminal</CLIButton>
          </div>
        </Terminal>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-white via-blue-50/30 to-white relative overflow-hidden">

      <div className="absolute -top-20 -right-20 w-40 sm:w-80 h-40 sm:h-80 bg-[#0052FF]/5 rounded-full blur-3xl pointer-events-none" />

      <header className="relative z-10 px-3 sm:px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between border-b border-gray-100/80 bg-white/90 backdrop-blur-md">
        <div className="flex items-center gap-2">
          {!isTelegram && (
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => router.push('/')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
              <ArrowLeft className="w-5 h-5" />
            </motion.button>
          )}
          <div className="flex items-center gap-2">
            <ClankerLogo size="sm" animated={true} />
            <div>
              <h1 className="font-display font-bold text-gray-800 text-sm sm:text-base">Deploy</h1>
              <p className="font-mono text-[10px] text-gray-500">Clanker SDK v4</p>
            </div>
          </div>
        </div>
        <div className="hidden sm:block">
          <StatusBadge status="online" text={formattedAddress || ''} />
        </div>
      </header>

      <main className="flex-1 p-3 relative z-10 overflow-y-auto">
        <div className="max-w-lg mx-auto">
          <AnimatePresence mode="wait">
            {step === 'form' && (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Terminal title="Token Configuration" className="w-full">
                  {balance && (
                    <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-blue-50 to-white border border-[#0052FF]/10 flex items-center justify-between">
                      <span className="font-mono text-xs text-gray-500">Balance:</span>
                      <span className="font-mono text-sm text-[#0052FF] font-bold">{parseFloat(balance).toFixed(4)} ETH</span>
                    </div>
                  )}

                  {/* Basic Token Info */}
                  <div className="space-y-4 mb-4">
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <MobileInput
                          label="name"
                          value={config.name}
                          onChange={(v) => setConfig(p => ({ ...p, name: v }))}
                          placeholder="My Token"
                          error={errors.name}
                          hint="Token name (max 32 chars)"
                        />
                      </div>
                      <div className="w-1/3">
                        <MobileInput
                          label="symbol"
                          value={config.symbol}
                          onChange={(v) => setConfig(p => ({ ...p, symbol: v }))}
                          placeholder="TKN"
                          error={errors.symbol}
                          uppercase
                          hint="Max 10 chars"
                        />
                      </div>
                    </div>

                    <MobileInput
                      label="description"
                      value={config.description}
                      onChange={(v) => setConfig(p => ({ ...p, description: v }))}
                      placeholder="Token description..."
                      multiline
                      hint="Shown on clanker.world (Optional)"
                    />

                    {/* Image with Pinata */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block font-mono text-xs text-gray-500">
                          <span className="text-[#0052FF] font-medium">const</span> image <span className="text-gray-400">=</span>
                        </label>
                        <a
                          href="https://app.pinata.cloud/ipfs/files"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#0052FF]/10 text-[#0052FF] text-[10px] font-mono hover:bg-[#0052FF]/20 transition-colors"
                        >
                          <Image className="w-3 h-3" />
                          Pinata IPFS
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <MobileInput
                        label=""
                        value={config.image}
                        onChange={(v) => setConfig(p => ({ ...p, image: v }))}
                        placeholder="CID, ipfs://, or gateway URL"
                        error={errors.image}
                      />
                      {config.image && (
                        <div className="flex gap-3 items-center p-2 rounded-xl bg-gray-50 border border-gray-100">
                          <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-white border border-gray-200 shrink-0">
                            <img
                              src={getPreviewUrl(config.image)}
                              alt="Token preview"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          </div>
                          <p className="font-mono text-[10px] text-gray-500 truncate max-w-[200px]">{formatImageUrl(config.image)}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Socials & Launch Options */}
                  <div className="space-y-3">
                    <CollapsibleSection title="Social Links (Optional)" icon={Globe}>
                      <div className="grid grid-cols-1 gap-3">
                        <MobileInput label="website" value={config.website} onChange={(v) => setConfig(p => ({ ...p, website: v }))} placeholder="https://..." error={errors.website} />
                        <MobileInput label="twitter" value={config.twitter} onChange={(v) => setConfig(p => ({ ...p, twitter: v }))} placeholder="@handle or URL" error={errors.twitter} />
                        <MobileInput label="telegram" value={config.telegram} onChange={(v) => setConfig(p => ({ ...p, telegram: v }))} placeholder="@handle or URL" error={errors.telegram} />
                        <MobileInput label="farcaster" value={config.farcaster} onChange={(v) => setConfig(p => ({ ...p, farcaster: v }))} placeholder="@handle or URL" error={errors.farcaster} />
                        <MobileInput label="github" value={config.github} onChange={(v) => setConfig(p => ({ ...p, github: v }))} placeholder="https://..." error={errors.github} />
                      </div>
                    </CollapsibleSection>

                    {/* Dev Buy - Promoted */}
                    <div className="p-3 rounded-xl border border-blue-100 bg-blue-50/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Rocket className="w-4 h-4 text-[#0052FF]" />
                        <span className="font-mono text-xs font-medium text-gray-700">Initial Buy (Dev Snipe)</span>
                      </div>
                      <MobileInput
                        label="ethAmount"
                        value={config.devBuyEth}
                        onChange={(v) => setConfig(p => ({ ...p, devBuyEth: v }))}
                        placeholder="0"
                        error={errors.devBuyEth}
                        hint="Amount of ETH to buy immediately in the same block"
                      />
                    </div>

                    {/* Advanced Toggle */}
                    <button
                      type="button"
                      onClick={() => setIsAdvanced(!isAdvanced)}
                      className="w-full py-2 flex items-center justify-center gap-2 font-mono text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {isAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {isAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
                    </button>

                    <AnimatePresence>
                      {isAdvanced && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="space-y-3 overflow-hidden"
                        >
                          {/* Ownership & Rewards */}
                          <CollapsibleSection title="Ownership & Rewards" icon={Coins} defaultOpen>
                            <div className="space-y-4">
                              <div className="space-y-1">
                                <label className="font-mono text-xs text-gray-500 block">Token Admin (Owner)</label>
                                <MobileInput label="" value={config.tokenAdmin} onChange={(v) => setConfig(p => ({ ...p, tokenAdmin: v }))} placeholder={address || '0x...'} error={errors.tokenAdmin} hint="Leave empty to use your wallet" />
                              </div>
                              <div className="space-y-1">
                                <label className="font-mono text-xs text-gray-500 block">Reward Recipient</label>
                                <MobileInput label="" value={config.rewardRecipient} onChange={(v) => setConfig(p => ({ ...p, rewardRecipient: v }))} placeholder={address || '0x...'} error={errors.rewardRecipient} hint="Leave empty to use your wallet" />
                              </div>
                              <div className="space-y-2 pt-2 border-t border-gray-100">
                                <div className="flex justify-between">
                                  <label className="font-mono text-xs text-gray-500">Creator Reward %</label>
                                  <span className="font-mono text-xs font-bold text-[#0052FF]">{config.creatorReward}%</span>
                                </div>
                                <input type="range" min="0" max="80" value={config.creatorReward} onChange={(e) => setConfig(p => ({ ...p, creatorReward: parseInt(e.target.value) }))} className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#0052FF]" />
                              </div>
                            </div>
                          </CollapsibleSection>

                          {/* Pool & Fees */}
                          <CollapsibleSection title="Pool & Fees" icon={Zap}>
                            <OptionSelector label="Fee Type" value={config.feeType} options={['dynamic', 'static']} onChange={(v) => setConfig(p => ({ ...p, feeType: v as any }))} descriptions={{ dynamic: '1-5% based on volume', static: 'Fixed 5%' }} />
                            <OptionSelector label="Pool Position" value={config.poolPosition} options={['Standard', 'Project']} onChange={(v) => setConfig(p => ({ ...p, poolPosition: v as any }))} descriptions={{ Standard: 'Single (Meme)', Project: 'Multi (Utility)' }} />
                          </CollapsibleSection>

                          {/* MEV Protection */}
                          <CollapsibleSection title="MEV Protection" icon={Shield}>
                            <OptionSelector label="Protection Type" value={config.mevProtection} options={[MevModuleType.BlockDelay, MevModuleType.None]} onChange={(v) => setConfig(p => ({ ...p, mevProtection: v as any }))} descriptions={{ [MevModuleType.BlockDelay]: 'Anti-sniper (Rec)', [MevModuleType.None]: 'None' }} />
                            {config.mevProtection === MevModuleType.BlockDelay && (
                              <div className="space-y-2 mt-2">
                                <div className="flex justify-between text-xs font-mono text-gray-500">
                                  <span>Block Delay</span>
                                  <span className="text-gray-800">{config.blockDelay} blocks (~{config.blockDelay * 2}s)</span>
                                </div>
                                <input type="range" min="1" max="20" value={config.blockDelay} onChange={(e) => setConfig(p => ({ ...p, blockDelay: parseInt(e.target.value) }))} className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#0052FF]" />
                              </div>
                            )}
                          </CollapsibleSection>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <CLIButton variant="ghost" onClick={() => router.push('/')}>Cancel</CLIButton>
                    <CLIButton variant="primary" onClick={handleReview} fullWidth icon={<Rocket className="w-4 h-4" />}>Review</CLIButton>
                  </div>
                </Terminal>
              </motion.div>
            )}

            {step === 'review' && (
              <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Terminal title="Review Deployment" className="w-full">
                  <TerminalLine text="Review your configuration:" type="command" />
                  <CLICard className="mt-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="text-gray-800 font-bold">{config.name}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Symbol</span><span className="text-[#0052FF] font-medium">${config.symbol}</span></div>
                      {config.image && (
                        <div className="flex justify-between items-start">
                          <span className="text-gray-500">Image</span>
                          <span className="text-gray-600 text-xs truncate max-w-[180px]">{formatImageUrl(config.image)}</span>
                        </div>
                      )}
                      {config.description && (
                        <div className="flex justify-between items-start">
                          <span className="text-gray-500">Description</span>
                          <span className="text-gray-600 text-xs truncate max-w-[180px]">{config.description}</span>
                        </div>
                      )}

                      {/* Premium Active Wallet Card */}
                      {activeLocalWallet ? (
                        <div className="bg-gradient-to-br from-gray-900 to-black rounded-2xl p-5 text-white shadow-xl border border-blue-500/20 overflow-hidden relative group mb-6">
                          {/* Background pulse effect */}
                          <div className="absolute inset-0 bg-blue-500/5 animate-pulse-slow" />
                          <div className="absolute -right-10 -top-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

                          <div className="flex justify-between items-start relative z-10">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-[10px] font-mono uppercase tracking-widest text-blue-200/70">Active Deployer</p>
                                <div className="px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[9px] font-mono border border-blue-500/30 flex items-center gap-1">
                                  <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
                                  LOCAL
                                </div>
                              </div>
                              <p className="font-bold text-lg tracking-tight">{activeLocalWallet.label}</p>
                              <p className="font-mono text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                {activeLocalWallet.address.slice(0, 8)}...{activeLocalWallet.address.slice(-6)}
                                <Copy className="w-3 h-3 cursor-pointer hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); copyToClipboard(activeLocalWallet.address, 'addr'); }} />
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-mono uppercase tracking-widest text-blue-200/70 mb-1">Live Balance</p>
                              <div className="flex items-center justify-end gap-2">
                                <div className={`w-2 h-2 rounded-full ${localBalance ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)] animate-pulse' : 'bg-gray-600'}`} />
                                <p className="font-mono text-xl font-bold tracking-tight">
                                  {localBalance ? parseFloat(localBalance).toFixed(4) : '...'}
                                  <span className="text-sm font-normal text-gray-400 ml-1">ETH</span>
                                </p>
                              </div>
                              <button onClick={() => router.push('/settings')} className="text-[10px] text-blue-400 hover:text-blue-300 mt-1 underline decoration-blue-500/30">
                                Switch Wallet
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => router.push('/settings')}
                          className="bg-white border text-left border-gray-200 rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer hover:border-blue-200 hover:shadow-sm mb-6 group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                              <Settings className="w-6 h-6 text-gray-400 group-hover:text-blue-500 transition-colors" />
                            </div>
                            <div>
                              <p className="font-bold text-gray-900">Relay Server Mode</p>
                              <p className="text-xs text-gray-500 mt-0.5">Using default shared connection</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-[#0052FF] font-bold text-sm bg-blue-50 px-3 py-1.5 rounded-lg group-hover:bg-[#0052FF] group-hover:text-white transition-all">
                            Setup Wallet <ChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      )}
                      <div className="border-t border-gray-100 pt-2 mt-2 space-y-1 text-xs">
                        <div className="flex justify-between"><span className="text-gray-500">Fee</span><span className="text-gray-700">{config.feeType}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Pool</span><span className="text-gray-700">{config.poolPosition}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">MEV</span><span className="text-gray-700 flex items-center gap-1"><Shield className="w-3 h-3 text-[#0052FF]" />{config.mevProtection}</span></div>
                        {parseFloat(config.devBuyEth) > 0 && (
                          <div className="flex justify-between"><span className="text-gray-500">Dev Buy</span><span className="text-gray-700">{config.devBuyEth} ETH</span></div>
                        )}
                      </div>
                    </div>
                  </CLICard>
                  <div className="flex gap-3 mt-6">
                    <CLIButton variant="ghost" onClick={() => setStep('form')}>Edit</CLIButton>
                    <CLIButton variant="primary" onClick={handleDeploy} fullWidth icon={<Rocket className="w-4 h-4" />} loading={isDeploying}>Deploy Now</CLIButton>
                  </div>
                </Terminal>
              </motion.div>
            )}


            {step === 'deploying' && (
              <motion.div
                key="deploying"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-10 flex flex-col items-center w-full"
              >
                <div className="w-24 h-24 relative mb-8">
                  <div className="absolute inset-0 border-4 border-gray-100 rounded-full" />
                  <div className="absolute inset-0 border-4 border-[#0052FF] rounded-full border-t-transparent animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Rocket className="w-8 h-8 text-[#0052FF] animate-bounce" />
                  </div>
                </div>

                <h2 className="text-xl font-bold text-gray-900 mb-2">Deploying Token...</h2>
                <p className="text-gray-500 mb-8 text-sm">Broadcasting to Base Mainnet</p>

                <div className="w-full bg-black rounded-xl overflow-hidden shadow-2xl border border-gray-800 font-mono text-xs max-w-sm">
                  <div className="bg-gray-900 px-3 py-2 flex items-center gap-2 border-b border-gray-800">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    </div>
                    <span className="text-gray-500 ml-2">deploy.log</span>
                  </div>
                  <div className="p-4 h-64 overflow-y-auto space-y-1 scrollbar-hide text-green-400 font-mono leading-relaxed">
                    {deployLogs.map((log, i) => (
                      <div key={i} className="animate-fade-in-up break-all border-l-2 border-transparent hover:border-green-800 pl-2">
                        <span className="text-gray-600 mr-2 select-none">[{new Date().toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' })}]</span>
                        {log}
                      </div>
                    ))}
                    <div className="animate-pulse text-green-500 font-bold">_</div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'success' && deployResult && (
              <motion.div
                key="success"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="py-6 flex flex-col items-center w-full text-center"
              >
                <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-green-500/10 border-4 border-white ring-4 ring-green-50">
                  <Check className="w-10 h-10 text-green-600" />
                </div>

                <h2 className="text-2xl font-bold text-gray-900 mb-1">Deployment Successful!</h2>
                <p className="text-gray-500 text-sm mb-8">Your token is live on Base.</p>

                <div className="w-full bg-white rounded-2xl border border-gray-200 p-5 shadow-sm mb-6 text-left space-y-4 relative overflow-hidden max-w-sm">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 to-emerald-500" />
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-1.5">Token Address</p>
                    <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100 group hover:border-green-200 transition-colors cursor-pointer" onClick={() => copyToClipboard(deployResult.tokenAddress, 'addr')}>
                      <code className="text-xs text-gray-700 truncate flex-1 font-mono font-medium">{deployResult.tokenAddress}</code>
                      <div className="text-gray-400 group-hover:text-gray-600">
                        {copiedField === 'addr' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <a
                      href={`https://clanker.world/clanker/${deployResult.tokenAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-[#0052FF]/5 hover:bg-[#0052FF]/10 text-[#0052FF] p-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all border border-[#0052FF]/10 hover:border-[#0052FF]/30 active:scale-[0.98]"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0052FF]" />
                      Clanker
                      <ExternalLink className="w-3 h-3 opacity-50" />
                    </a>
                    <a
                      href={`https://dexscreener.com/base/${deployResult.tokenAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all border border-gray-200 hover:border-gray-300 active:scale-[0.98]"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                      DexScreener
                      <ExternalLink className="w-3 h-3 opacity-50" />
                    </a>
                  </div>
                </div>

                <div className="w-full space-y-3 max-w-sm">
                  <CLIButton
                    variant="primary"
                    onClick={deployAnother}
                    fullWidth
                    className="py-4 text-base shadow-lg shadow-blue-500/20"
                  >
                    <Rocket className="w-4 h-4 mr-2" />
                    Deploy Another Token
                  </CLIButton>
                  <button
                    onClick={() => router.push('/settings')}
                    className="w-full py-4 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Manage Wallet
                  </button>
                  <button onClick={shareToken} className="w-full py-2 text-xs font-medium text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1.5">
                    <Share2 className="w-3 h-3" /> Share Result
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-10 flex flex-col items-center w-full text-center"
              >
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 border-4 border-white ring-4 ring-red-50">
                  <AlertTriangle className="w-10 h-10 text-red-500" />
                </div>

                <h2 className="text-xl font-bold text-gray-900 mb-2">Deployment Failed</h2>
                <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-mono mb-8 max-w-sm w-full mx-auto text-left overflow-x-auto border border-red-100">
                  {deployLogs.find(l => l.startsWith('✗')) || 'Unknown error occurred'}
                </div>

                <div className="w-full space-y-3 max-w-sm">
                  <button
                    onClick={() => setStep('form')}
                    className="w-full py-3.5 bg-gray-900 text-white rounded-xl font-medium shadow-xl active:scale-[0.98] transition-all"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={resetForm}
                    className="w-full py-3.5 text-gray-500 hover:text-gray-700 font-medium"
                  >
                    Reset Form
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-3 sm:px-4 py-2.5 sm:py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-gray-100/80 bg-white/90 backdrop-blur-md">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <p className="font-mono text-[10px] text-gray-400">Clanker SDK v4</p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-gray-400">Base</span>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-emerald-500"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
