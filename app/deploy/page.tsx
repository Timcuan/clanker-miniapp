'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Rocket, Check,
  Shield, Zap, Copy, Clipboard, Image, Coins, User, Lock, Gift, Star, Link,
  Globe, RefreshCw, ChevronDown, ChevronUp, ChevronRight, Share2, Settings, AlertTriangle
} from 'lucide-react';
import ClankerLogo from '@/components/ui/ClankerLogo';
import { useTelegramContext } from '@/components/layout/TelegramProvider';
import { useWallet } from '@/contexts/WalletContext';
import { showBackButton, hideBackButton, hapticFeedback } from '@/lib/telegram/webapp';
import { Terminal, TerminalLine } from '@/components/ui/Terminal';
import { CLIButton, StatusBadge } from '@/components/ui/CLIButton';
import { shortenAddress, copyToClipboard } from '@/lib/utils';
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
  creatorReward: number; // 0-100%

  // Pool & Fees
  feeType: 'dynamic' | 'static' | 'degen' | 'low';
  poolPosition: 'Standard' | 'Project';

  // MEV Protection
  mevProtection: MevModuleType;
  blockDelay: number;

  // Dev Buy (optional)
  devBuyEth: string;

  // Vanity (optional)
  vanityEnabled: boolean;

  // Vault Settings
  vaultEnabled: boolean;
  vaultPercentage: string;
  vaultLockup: string;
  vaultVesting: string;
  vaultRecipient: string;

  // Airdrop Settings
  airdropEnabled: boolean;
  airdropAmount: string;
  airdropRoot: string;
  airdropLockup: string;
  airdropVesting: string;
  airdropAdmin: string;

  // Presale Settings
  presaleEnabled: boolean;
  presaleBps: string;

  // Pool Extension Settings
  poolExtEnabled: boolean;
  poolExtAddress: string;
  poolExtInitData: string;
  vanityPrefix: string;
  salt: string;
  staticFeePercentage: number;
}

const INITIAL_CONFIG: TokenConfig = {
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
  creatorReward: 100, // Default: 100% to recipient
  feeType: 'static',
  poolPosition: DEFAULT_CONFIG.poolPositionType,
  mevProtection: DEFAULT_CONFIG.mevModuleType,
  blockDelay: DEFAULT_CONFIG.blockDelay,
  devBuyEth: '0',
  vanityEnabled: true,

  vaultEnabled: false,
  vaultPercentage: '',
  vaultLockup: '',
  vaultVesting: '',
  vaultRecipient: '',

  airdropEnabled: false,
  airdropAmount: '',
  airdropRoot: '',
  airdropLockup: '',
  airdropVesting: '',
  airdropAdmin: '',

  presaleEnabled: false,
  presaleBps: '',

  poolExtEnabled: false,
  poolExtAddress: '',
  poolExtInitData: '',
  vanityPrefix: '',
  salt: '',
  staticFeePercentage: 10,
};

const STORAGE_KEY = 'clanker_deploy_form';

interface DeployResult {
  txHash: string;
  tokenAddress: string;
  id: string;
}


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
  label, value, onChange, placeholder, error, multiline = false, uppercase = false, hint, agentId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
  multiline?: boolean;
  uppercase?: boolean;
  hint?: string;
  agentId?: string;
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

  const inputClass = `w-full bg-white dark:bg-gray-900 border ${error ? 'border-red-300 dark:border-red-500/50' : 'border-gray-200 dark:border-gray-800'} rounded-xl px-4 py-3 pr-12 font-mono text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20 transition-all`;

  return (
    <div className="space-y-1">
      {label && (
        <label className="block font-mono text-xs text-gray-500 dark:text-gray-400">
          <span className="text-[#0052FF] font-medium">const</span> {label} <span className="text-gray-400 dark:text-gray-600">=</span>
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
            {...(agentId && { 'data-agent': agentId })}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
            placeholder={placeholder}
            className={inputClass}
            {...(agentId && { 'data-agent': agentId })}
          />
        )}
        <button
          type="button"
          onClick={handlePaste}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <Clipboard className="w-4 h-4" />
        </button>
      </div>
      {hint && !error && <p className="font-mono text-[10px] text-gray-500 dark:text-gray-500">{hint}</p>}
      {error && <p className="font-mono text-xs text-red-500 dark:text-red-400">Error: {error}</p>}
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
      <label className="block font-mono text-xs text-gray-500 dark:text-gray-400">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => { onChange(opt); hapticFeedback('light'); }}
            className={`p-3 rounded-xl border font-mono text-xs text-left transition-all ${value === opt
              ? 'border-[#0052FF] bg-[#0052FF]/10 text-[#0052FF]'
              : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
          >
            <div className="font-semibold text-gray-800 dark:text-gray-200">{opt}</div>
            {descriptions?.[opt] && <div className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">{descriptions[opt]}</div>}
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
    <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-900/40">
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); hapticFeedback('light'); }}
        className="w-full p-3 flex items-center justify-between bg-gray-50 dark:bg-gray-900/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <span className="font-mono text-xs flex items-center gap-2 text-gray-700 dark:text-gray-300">
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
            <div className="p-3 space-y-4 border-t border-gray-100 dark:border-gray-800">
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
  const { isAuthenticated, formattedAddress, balance, address, telegramUserId: walletTelegramUserId } = useWallet();
  const { isTelegram, user: tgUser } = useTelegramContext();

  const telegramUserId = walletTelegramUserId || tgUser?.id || 0;

  // ── All state declarations grouped together ──────────────────────────────
  const [step, setStep] = useState<DeployStep>('form');
  const [config, setConfig] = useState<TokenConfig>(INITIAL_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [activeLocalWallet, setActiveLocalWallet] = useState<{ address: string; label: string } | null>(null);
  const [localBalance, setLocalBalance] = useState<string | null>(null);


  // ── All effects follow state declarations ────────────────────────────────

  // Fetch ETH Price
  useEffect(() => {
    fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot')
      .then(res => res.json())
      .then(data => setEthPrice(parseFloat(data.data.amount)))
      .catch(err => console.error('Failed to fetch ETH price', err));
  }, []);

  // Persistence: Load from localStorage on mount
  useEffect(() => {
    const savedForm = localStorage.getItem(STORAGE_KEY);
    if (savedForm) {
      try {
        const parsed = JSON.parse(savedForm);
        setConfig(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error('Failed to load form state');
      }
    }

    const savedPrefs = localStorage.getItem('clanker_prefs');
    if (savedPrefs) {
      try {
        const parsed = JSON.parse(savedPrefs);
        if (parsed.advancedMode !== undefined) setIsAdvanced(parsed.advancedMode);
      } catch (e) { }
    }

    setIsLoaded(true);
  }, []);

  // PRO Refinement: Smart Salt Logic (B07 vs Random)
  useEffect(() => {
    if (!isLoaded) return;

    if (config.vanityEnabled) {
      if (!config.salt || !config.salt.startsWith('0xb07')) {
        const randomPart = Array.from({ length: 61 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
        setConfig(p => ({ ...p, salt: '0xb07' + randomPart }));
      }
    } else {
      if (!config.salt || config.salt.startsWith('0xb07')) {
        const fullRandom = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
        setConfig(p => ({ ...p, salt: fullRandom }));
      }
    }
  }, [config.vanityEnabled, isLoaded]);

  // Persistence: Save to localStorage on change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }, [config, isLoaded]);

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

    // Address validation (strict regex)
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!config.tokenAdmin || !ethAddressRegex.test(config.tokenAdmin)) {
      newErrors.tokenAdmin = 'Invalid address';
    }
    if (!config.rewardRecipient || !ethAddressRegex.test(config.rewardRecipient)) {
      newErrors.rewardRecipient = 'Invalid address';
    }

    // URL validation (strict check for socials)
    const validateSocial = (val: string) => val ? (isValidUrl(val) || val.startsWith('@')) : true;
    if (!validateSocial(config.twitter)) newErrors.twitter = 'Invalid';
    if (!validateSocial(config.telegram)) newErrors.telegram = 'Invalid';
    if (!validateSocial(config.farcaster)) newErrors.farcaster = 'Invalid';

    // Creator reward validation (100% as requested)
    if (config.creatorReward < 0 || config.creatorReward > 100) {
      newErrors.creatorReward = '0-100%';
    }

    // Dev buy validation
    const devBuy = parseFloat(config.devBuyEth);
    if (isNaN(devBuy) || devBuy < 0) {
      newErrors.devBuyEth = 'Invalid amount';
    } else if (devBuy > 0) {
      const currentBalanceStr = activeLocalWallet ? localBalance : balance;
      if (currentBalanceStr && devBuy >= parseFloat(currentBalanceStr)) {
        newErrors.devBuyEth = 'Insufficient balance';
      }
    }

    // Salt validation
    if (config.salt && !/^0x[a-fA-F0-9]{64}$/.test(config.salt)) {
      newErrors.salt = 'Invalid salt format (0x + 64 hex characters)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [config]);

  const addLog = useCallback((msg: string) => {
    setDeployLogs(prev => [...prev, msg]);
  }, []);

  // NOTE: copyToClipboard is imported from @/lib/utils
  // Wrapper to also set the copiedField UI state
  const handleCopy = async (text: string, field: string) => {
    await copyToClipboard(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
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

    // Validate and normalize salt (must match /^0x[a-fA-F0-9]{64}$/ or be undefined)
    const deploymentSalt = /^0x[a-fA-F0-9]{64}$/.test(config.salt)
      ? (config.salt as `0x${string}`)
      : undefined;

    const performRelayDeploy = async (
      tokenAdmin: string,
      rewardRecipient: string,
      imageUrl: string,
      socialMediaUrls: Array<{ platform: string; url: string }>
    ) => {
      addLog('Routing via Server-Relay...');
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // sends session cookie for auth + telegramUserId
        body: JSON.stringify({
          // ── Token Identity ──────────────────────────────────
          name: config.name,
          symbol: config.symbol.toUpperCase(),
          image: imageUrl || undefined,
          description: config.description || undefined,
          socialMediaUrls: socialMediaUrls.length > 0 ? socialMediaUrls : undefined,

          // ── Addresses ───────────────────────────────────────
          tokenAdmin,
          rewardRecipient,

          // ── Economics ───────────────────────────────────────
          creatorReward: Number(config.creatorReward),
          feeType: config.feeType,
          staticFeePercentage: config.feeType === 'static' ? config.staticFeePercentage : undefined,
          poolPosition: config.poolPosition,

          // ── MEV & Safety ────────────────────────────────────
          mevProtection: config.mevProtection, // MevModuleType enum matches Zod nativeEnum
          blockDelay: Number(config.blockDelay),

          // ── Dev Buy ─────────────────────────────────────────
          devBuyEth: parseFloat(config.devBuyEth) || 0,

          // ── Vanity ──────────────────────────────────────────
          ...(deploymentSalt ? { salt: deploymentSalt } : {}),
          vanity: config.vanityEnabled,

          // ── Advanced V4 Features ────────────────────────────
          ...(config.vaultEnabled ? {
            vault: {
              percentage: Number(config.vaultPercentage),
              lockupDuration: Number(config.vaultLockup),
              vestingDuration: Number(config.vaultVesting),
              recipient: config.vaultRecipient || undefined,
            }
          } : {}),
          ...(config.airdropEnabled ? {
            airdrop: {
              amount: Number(config.airdropAmount),
              merkleRoot: config.airdropRoot,
              lockupDuration: Number(config.airdropLockup),
              vestingDuration: Number(config.airdropVesting),
              admin: config.airdropAdmin || undefined,
            }
          } : {}),
          ...(config.presaleEnabled ? {
            presale: { bps: Number(config.presaleBps) }
          } : {}),
          ...(config.poolExtEnabled ? {
            poolExtension: {
              address: config.poolExtAddress,
              initData: config.poolExtInitData,
            }
          } : {}),

          // NOTE: platform & telegramUserId are NOT sent here.
          // The API extracts telegramUserId from the session cookie automatically.
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const errMsg = data.details
          ? `${data.error}: ${JSON.stringify(data.details)}`
          : (data.error || 'Server deployment failed');
        throw new Error(errMsg);
      }
      return data;
    };

    try {
      let resultData;

      if (activeLocalWallet) {
        // ── LOCAL SIGNING PATH ─────────────────────────────────────────────
        addLog('Signing transaction locally...');
        try {
          const { deployToken } = await import('@/lib/clanker/deployer');

          // Build a clean explicit config — do NOT spread raw form state
          const localDeployConfig = {
            // Token identity
            name: config.name,
            symbol: config.symbol.toUpperCase(),
            image: imageUrl,
            tokenAdmin,
            rewardRecipient,
            description: config.description || '',
            socialMediaUrls,

            // Fee & pool
            feeType: config.feeType,
            poolPosition: config.poolPosition,
            staticFeePercentage: config.feeType === 'static' ? config.staticFeePercentage : undefined,

            // MEV protection
            mevProtection: config.mevProtection === MevModuleType.BlockDelay ? 'BlockDelay' : 'None' as 'BlockDelay' | 'None',
            blockDelay: Number(config.blockDelay),

            // Economics
            creatorReward: Number(config.creatorReward),
            devBuyEth: Number(config.devBuyEth) || 0,

            // Vanity
            salt: deploymentSalt,
            vanity: config.vanityEnabled,

            // Advanced V4 Features
            ...(config.vaultEnabled ? {
              vault: {
                percentage: Number(config.vaultPercentage),
                lockupDuration: Number(config.vaultLockup),
                vestingDuration: Number(config.vaultVesting),
                recipient: config.vaultRecipient || undefined,
              }
            } : {}),
            ...(config.airdropEnabled ? {
              airdrop: {
                amount: Number(config.airdropAmount),
                merkleRoot: config.airdropRoot,
                lockupDuration: Number(config.airdropLockup),
                vestingDuration: Number(config.airdropVesting),
                admin: config.airdropAdmin || undefined,
              }
            } : {}),
            ...(config.presaleEnabled ? {
              presale: { bps: Number(config.presaleBps) }
            } : {}),
            ...(config.poolExtEnabled ? {
              poolExtension: {
                address: config.poolExtAddress,
                initData: config.poolExtInitData,
              }
            } : {}),

            // Context
            platform: 'web' as const,
            telegramUserId: telegramUserId || undefined,
          };

          const result = await deployToken(activeLocalWallet.privateKey, localDeployConfig);

          if (!result.success || !result.tokenAddress) {
            throw new Error(result.error || 'Deployment failed locally');
          }

          resultData = {
            txHash: result.txHash!,
            tokenAddress: result.tokenAddress!,
            id: 'local-' + Date.now(),
            verified: true
          };
        } catch (localErr: any) {
          addLog(`✗ Local attempt failed: ${localErr.message.slice(0, 80)}`);

          // Fallback to relay on gas/balance/nonce/rejected errors
          const shouldFallback = ['Insuf', 'nonce', 'gas', 'reject', 'fund', 'fee'].some(
            kw => localErr.message.toLowerCase().includes(kw.toLowerCase())
          );

          if (shouldFallback) {
            addLog('⟳ Auto-switching to Relay for resilience...');
            resultData = await performRelayDeploy(tokenAdmin, rewardRecipient, imageUrl, socialMediaUrls);
          } else {
            throw localErr; // Re-throw fundamental errors (bad config, etc.)
          }
        }
      } else {
        // ── SERVER RELAY PATH ──────────────────────────────────────────────
        addLog('Mode: Server-Relay Deployment');
        resultData = await performRelayDeploy(tokenAdmin, rewardRecipient, imageUrl, socialMediaUrls);
      }


      // Success handling for both modes
      await new Promise(r => setTimeout(r, 500));
      addLog(`TX: ${resultData.txHash ? resultData.txHash.slice(0, 10) : '...'}...`);
      addLog('✓ Transactions Broadcasted');
      addLog('✓ Waiting for Block Confirmation...');

      addLog('✓ Confirmed on Base!');
      addLog(`Token: ${resultData.tokenAddress ? resultData.tokenAddress.slice(0, 10) : '...'}...`);
      if (resultData.verified) addLog('✓ Verified by Clanker');

      setDeployResult({ txHash: resultData.txHash!, tokenAddress: resultData.tokenAddress!, id: resultData.id });
      hapticFeedback('success');
      setStep('success');

    } catch (error) {
      console.error('Deploy error', error);
      addLog(`✗ Final Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Final fallback hint
      if (!activeLocalWallet) {
        addLog('Hint: If this persists, try importing a private key in Settings for direct control');
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
      ...INITIAL_CONFIG,
      tokenAdmin: address || '',
      rewardRecipient: address || '',
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

  // Helper to format balance with USD
  const formatBalance = (bal: string | null) => {
    if (!bal) return 'Loading...';
    const eth = parseFloat(bal);
    if (ethPrice) {
      const usd = (eth * ethPrice).toFixed(2);
      return `${eth.toFixed(4)} ETH (~$${usd})`;
    }
    return `${eth.toFixed(4)} ETH`;
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 relative overflow-hidden">

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
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden transition-colors bg-gradient-to-br from-white via-gray-50 to-white dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">

      <div className="absolute -top-20 -right-20 w-40 sm:w-80 h-40 sm:h-80 bg-[#0052FF]/5 dark:bg-[#0052FF]/10 rounded-full blur-3xl pointer-events-none" />

      <header className="relative z-10 px-3 sm:px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between border-b border-gray-100/80 dark:border-gray-800/80 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md">
        <div className="flex items-center gap-2">
          {!isTelegram && (
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => router.push('/')} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
              <ArrowLeft className="w-5 h-5" />
            </motion.button>
          )}
          <div className="flex items-center gap-2">
            <ClankerLogo size="sm" animated={true} />
            <div>
              <h1 className="font-display font-bold text-gray-800 dark:text-gray-100 text-sm sm:text-base">Deploy</h1>
              <p className="font-mono text-[10px] text-gray-500 dark:text-gray-400">Clanker SDK v4</p>
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
              <motion.div key="form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                <Terminal title="Token Configuration" className="w-full">
                  {/* Balance & Advanced Toggle */}
                  <div className="mb-4 flex items-center justify-between gap-3">
                    {balance ? (
                      <div className="flex-1 p-2.5 rounded-lg bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 flex items-center justify-between">
                        <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400">ETH Balance</span>
                        <span className="font-mono text-xs text-[#0052FF] dark:text-blue-400 font-bold">{formatBalance(balance)}</span>
                      </div>
                    ) : <div className="flex-1" />}

                    <button
                      type="button"
                      onClick={() => {
                        setIsAdvanced(!isAdvanced);
                        hapticFeedback('light');
                      }}
                      className={`p-2.5 rounded-lg border flex items-center gap-2 transition-all ${isAdvanced
                        ? 'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-700 text-gray-800 dark:text-gray-200'
                        : 'bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}
                    >
                      <Settings className="w-4 h-4" />
                      <span className="font-mono text-[10px] font-medium">{isAdvanced ? 'ADVANCED' : 'BASIC'}</span>
                    </button>
                  </div>

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
                          agentId="deploy-name-input"
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
                          agentId="deploy-symbol-input"
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
                      agentId="deploy-description-input"
                    />

                    {/* Image with Pinata */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block font-mono text-xs text-gray-500 dark:text-gray-400">
                          <span className="text-[#0052FF] font-medium">const</span> image <span className="text-gray-400 dark:text-gray-600">=</span>
                        </label>
                      </div>
                      <MobileInput
                        label=""
                        value={config.image}
                        onChange={(v) => setConfig(p => ({ ...p, image: v }))}
                        placeholder="CID or Image URL"
                        error={errors.image}
                        agentId="deploy-image-input"
                      />
                      {config.image && (
                        <div className="flex gap-3 items-center p-2 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                          <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shrink-0">
                            <img
                              src={getPreviewUrl(config.image)}
                              alt="Token preview"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          </div>
                          <p className="font-mono text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[200px]">{formatImageUrl(config.image)}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Socials & Launch Options */}
                  <div className="space-y-3">
                    <CollapsibleSection title="Social Links (Optional)" icon={Globe}>
                      <div className="grid grid-cols-1 gap-3">
                        <MobileInput label="website" value={config.website} onChange={(v) => setConfig(p => ({ ...p, website: v }))} placeholder="https://..." error={errors.website} agentId="deploy-website-input" />
                        <MobileInput label="twitter" value={config.twitter} onChange={(v) => setConfig(p => ({ ...p, twitter: v }))} placeholder="@handle or URL" error={errors.twitter} agentId="deploy-twitter-input" />
                        <MobileInput label="telegram" value={config.telegram} onChange={(v) => setConfig(p => ({ ...p, telegram: v }))} placeholder="@handle or URL" error={errors.telegram} agentId="deploy-telegram-input" />
                        <MobileInput label="farcaster" value={config.farcaster} onChange={(v) => setConfig(p => ({ ...p, farcaster: v }))} placeholder="@handle or URL" error={errors.farcaster} agentId="deploy-farcaster-input" />
                        <MobileInput label="github" value={config.github} onChange={(v) => setConfig(p => ({ ...p, github: v }))} placeholder="https://..." error={errors.github} agentId="deploy-github-input" />
                      </div>
                    </CollapsibleSection>

                    <AnimatePresence>
                      {isAdvanced && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="space-y-3 overflow-hidden"
                        >
                          {/* Pool Type */}
                          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                            <div className="flex items-center gap-2 mb-3">
                              <Zap className="w-4 h-4 text-amber-500" />
                              <span className="font-mono text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Token Economics</span>
                            </div>

                            <div className="space-y-4">
                              <OptionSelector
                                label="Fee Structure"
                                value={config.feeType}
                                options={['dynamic', 'static']}
                                onChange={(v) => setConfig(p => ({ ...p, feeType: v as any }))}
                                descriptions={{
                                  dynamic: 'Standard (1-10%)',
                                  static: `Fixed (${config.staticFeePercentage}%)`
                                }}
                              />

                              {/* Static Fee Slider */}
                              {config.feeType === 'static' && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  className="pt-2 px-1"
                                >
                                  <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-mono text-gray-500">Static Fee %</span>
                                    <span className="text-xs font-mono font-bold text-[#0052FF]">{config.staticFeePercentage}%</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="50"
                                    step="0.1"
                                    value={config.staticFeePercentage}
                                    onChange={(e) => setConfig(p => ({ ...p, staticFeePercentage: parseFloat(e.target.value) }))}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-[#0052FF]"
                                  />
                                  <p className="mt-1 text-[10px] text-gray-400 font-mono text-right">0% - 50% Range</p>
                                </motion.div>
                              )}
                            </div>
                          </div>

                          {/* Recipients */}
                          <CollapsibleSection title="Advanced Recipients" icon={User}>
                            <div className="space-y-4">
                              <MobileInput label="admin" value={config.tokenAdmin} onChange={(v) => setConfig(p => ({ ...p, tokenAdmin: v }))} placeholder={address || '0x...'} error={errors.tokenAdmin} hint="Token Admin" />
                              <MobileInput label="reward" value={config.rewardRecipient} onChange={(v) => setConfig(p => ({ ...p, rewardRecipient: v }))} placeholder={address || '0x...'} error={errors.rewardRecipient} hint="Reward Recipient" />
                            </div>
                          </CollapsibleSection>

                          {/* Vanity Section - Simple Toggle */}
                          <div className="p-4 rounded-xl border border-purple-100 dark:border-purple-900/30 bg-purple-50/20 dark:bg-purple-900/10 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                                  <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                </div>
                                <div>
                                  <h4 className="font-mono text-xs font-bold text-gray-800 dark:text-gray-200">Vanity Address</h4>
                                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Generate a custom contract address</p>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setConfig(p => ({ ...p, vanityEnabled: !p.vanityEnabled }));
                                  hapticFeedback('medium');
                                }}
                                className={`w-12 h-7 rounded-full transition-all duration-300 relative ${config.vanityEnabled
                                  ? 'bg-purple-600 shadow-inner'
                                  : 'bg-gray-200 dark:bg-gray-700'
                                  }`}
                              >
                                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${config.vanityEnabled ? 'left-6' : 'left-1'
                                  }`} />
                              </button>
                            </div>
                          </div>

                          {/* Vault Configuration */}
                          <CollapsibleSection title="Vault Configuration" icon={Lock}>
                            <div className="space-y-4">
                              <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                                <span className="font-mono text-xs text-gray-600 dark:text-gray-400">Enable Token Vault</span>
                                <input type="checkbox" checked={config.vaultEnabled} onChange={(e) => setConfig(p => ({ ...p, vaultEnabled: e.target.checked }))} className="w-4 h-4 rounded text-[#0052FF]" />
                              </div>
                              {config.vaultEnabled && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
                                  <div className="flex gap-2">
                                    <div className="w-1/2">
                                      <MobileInput label="percentage" value={config.vaultPercentage} onChange={(v) => setConfig(p => ({ ...p, vaultPercentage: v }))} placeholder="0-100" hint="Supply %" />
                                    </div>
                                    <div className="w-1/2">
                                      <MobileInput label="lockup" value={config.vaultLockup} onChange={(v) => setConfig(p => ({ ...p, vaultLockup: v }))} placeholder="Seconds..." hint="Lock Duration" />
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <div className="w-1/2">
                                      <MobileInput label="vesting" value={config.vaultVesting} onChange={(v) => setConfig(p => ({ ...p, vaultVesting: v }))} placeholder="Seconds..." hint="Vest Duration" />
                                    </div>
                                    <div className="w-1/2">
                                      <MobileInput label="recipient" value={config.vaultRecipient} onChange={(v) => setConfig(p => ({ ...p, vaultRecipient: v }))} placeholder="0x..." hint="Custom Recipient" />
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          </CollapsibleSection>

                          {/* Airdrop Configuration */}
                          <CollapsibleSection title="Airdrop (Merkle Allocation)" icon={Gift}>
                            <div className="space-y-4">
                              <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                                <span className="font-mono text-xs text-gray-600 dark:text-gray-400">Enable Supply Airdrop</span>
                                <input type="checkbox" checked={config.airdropEnabled} onChange={(e) => setConfig(p => ({ ...p, airdropEnabled: e.target.checked }))} className="w-4 h-4 rounded text-[#0052FF]" />
                              </div>
                              {config.airdropEnabled && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
                                  <MobileInput label="amount" value={config.airdropAmount} onChange={(v) => setConfig(p => ({ ...p, airdropAmount: v }))} placeholder="Tokens to airdrop..." hint="Total Amount" />
                                  <MobileInput label="merkleRoot" value={config.airdropRoot} onChange={(v) => setConfig(p => ({ ...p, airdropRoot: v }))} placeholder="0x..." hint="Merkle Root (bytes32)" />
                                  <div className="flex gap-2">
                                    <div className="w-1/2">
                                      <MobileInput label="lockup" value={config.airdropLockup} onChange={(v) => setConfig(p => ({ ...p, airdropLockup: v }))} placeholder="Seconds" hint="Lock Duration" />
                                    </div>
                                    <div className="w-1/2">
                                      <MobileInput label="vesting" value={config.airdropVesting} onChange={(v) => setConfig(p => ({ ...p, airdropVesting: v }))} placeholder="Seconds" hint="Vest Duration" />
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          </CollapsibleSection>

                          {/* Presale Configuration */}
                          <CollapsibleSection title="Presale Allocation" icon={Star}>
                            <div className="space-y-4">
                              <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                                <span className="font-mono text-xs text-gray-600 dark:text-gray-400">Enable Presale Supply</span>
                                <input type="checkbox" checked={config.presaleEnabled} onChange={(e) => setConfig(p => ({ ...p, presaleEnabled: e.target.checked }))} className="w-4 h-4 rounded text-[#0052FF]" />
                              </div>
                              {config.presaleEnabled && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
                                  <MobileInput label="bps" value={config.presaleBps} onChange={(v) => setConfig(p => ({ ...p, presaleBps: v }))} placeholder="1000 = 10%" hint="Presale BPS (0-10000)" />
                                </motion.div>
                              )}
                            </div>
                          </CollapsibleSection>

                          {/* Pool Extension (v4.1) */}
                          <CollapsibleSection title="Pool Extension (Advanced)" icon={Link}>
                            <div className="space-y-4">
                              <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                                <span className="font-mono text-xs text-gray-600 dark:text-gray-400">Enable Pool Extension</span>
                                <input type="checkbox" checked={config.poolExtEnabled} onChange={(e) => setConfig(p => ({ ...p, poolExtEnabled: e.target.checked }))} className="w-4 h-4 rounded text-[#0052FF]" />
                              </div>
                              {config.poolExtEnabled && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
                                  <MobileInput label="address" value={config.poolExtAddress} onChange={(v) => setConfig(p => ({ ...p, poolExtAddress: v }))} placeholder="0x..." hint="Extension Address" />
                                  <MobileInput label="initData" value={config.poolExtInitData} onChange={(v) => setConfig(p => ({ ...p, poolExtInitData: v }))} placeholder="0x..." hint="Init Data (bytes)" />
                                </motion.div>
                              )}
                            </div>
                          </CollapsibleSection>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <CLIButton variant="ghost" onClick={() => router.push('/')} agentId="deploy-cancel-button">Cancel</CLIButton>
                    <CLIButton variant="primary" onClick={handleReview} fullWidth icon={<Rocket className="w-4 h-4" />} agentId="deploy-review-button">Review</CLIButton>
                  </div>
                </Terminal>
              </motion.div>
            )}

            {step === 'review' && (
              <motion.div key="review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                <div className="relative">
                  {/* Decorative background glow */}
                  <div className="absolute inset-0 bg-blue-500/5 dark:bg-blue-500/10 blur-3xl -z-10 rounded-full" />

                  <Terminal title="review@base:~/deployment-config" className="w-full shadow-2xl overflow-hidden border-blue-500/20">
                    <div className="flex items-center gap-2 mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
                      <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                        <Rocket className="w-5 h-5 text-[#0052FF]" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wider">Deployment Receipt</h2>
                        <p className="text-[10px] font-mono text-gray-500">v4.0.2-stable</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      {/* Token Identity Section */}
                      <section>
                        <h3 className="text-[10px] font-mono font-bold text-[#0052FF] uppercase tracking-widest mb-3 opacity-70">01 // Identity</h3>
                        <div className="grid grid-cols-1 gap-3">
                          <div className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                            <div className="w-12 h-12 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                              {config.image ? (
                                <img src={getPreviewUrl(config.image)} alt="Preview" className="w-full h-full object-cover" />
                              ) : (
                                <Image className="w-6 h-6 text-gray-300" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 dark:text-white truncate">{config.name}</p>
                              <p className="font-mono text-xs text-[#0052FF] font-medium tracking-wider">${config.symbol}</p>
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Launch Strategy Section */}
                      <section>
                        <h3 className="text-[10px] font-mono font-bold text-emerald-500 uppercase tracking-widest mb-3 opacity-70">02 // Launch Strategy</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                            <p className="text-[9px] font-mono text-gray-500 mb-1">Fee Type</p>
                            <div className="flex items-center gap-1.5 font-bold text-xs text-gray-800 dark:text-gray-200 uppercase">
                              <Zap className="w-3 h-3 text-amber-500" />
                              {config.feeType}
                            </div>
                          </div>
                          <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                            <p className="text-[9px] font-mono text-gray-500 mb-1">Pool Type</p>
                            <div className="flex items-center gap-1.5 font-bold text-xs text-gray-800 dark:text-gray-200 uppercase">
                              <Globe className="w-3 h-3 text-blue-500" />
                              {config.poolPosition}
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Governance Section */}
                      <section>
                        <h3 className="text-[10px] font-mono font-bold text-purple-500 uppercase tracking-widest mb-3 opacity-70">03 // Governance</h3>
                        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-mono text-gray-500">Creator Reward</span>
                            <span className="text-xs font-bold text-emerald-500">{config.creatorReward}%</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-mono text-gray-500">MEV Protection</span>
                            <span className="text-xs font-bold text-blue-500 flex items-center gap-1">
                              <Shield className="w-3 h-3" />
                              {config.mevProtection}
                            </span>
                          </div>
                          <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-mono text-gray-500">Admin</span>
                              <span className="text-[10px] font-mono text-gray-700 dark:text-gray-300">{shortenAddress(config.tokenAdmin)}</span>
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Priority Execution Section */}
                      {activeLocalWallet ? (
                        <motion.div
                          initial={{ scale: 0.98, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="p-4 rounded-2xl bg-gradient-to-br from-gray-900 to-black border border-blue-500/30 shadow-xl relative overflow-hidden group"
                        >
                          <div className="absolute inset-0 bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors" />
                          <div className="flex items-start justify-between relative z-10">
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300 text-[8px] font-bold tracking-tighter border border-blue-500/30">PRIORITY</span>
                                <span className="text-[10px] font-mono text-blue-200/50 uppercase tracking-widest">Local Signing</span>
                              </div>
                              <h4 className="font-bold text-white text-base">{activeLocalWallet.label}</h4>
                              <p className="font-mono text-[9px] text-gray-400 mt-1">{shortenAddress(activeLocalWallet.address, 6)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] font-mono text-blue-200/50 mb-1">AVAL. BALANCE</p>
                              <p className="font-mono text-lg font-bold text-white">
                                {localBalance ? parseFloat(localBalance).toFixed(4) : '0.000'}
                                <span className="text-[10px] text-gray-500 ml-1">ETH</span>
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      ) : (
                        <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-amber-500/20 flex items-center justify-between border-dashed">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-500">
                              <RefreshCw className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm">Relay Fallback Active</h4>
                              <p className="text-[10px] text-gray-500 tracking-tight">Deployment via Shared Gas Pooled System</p>
                            </div>
                          </div>
                          <div className="text-[9px] font-mono bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2 py-1 rounded border border-amber-200 dark:border-amber-800/50">RESILIENT</div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3 mt-8">
                      <CLIButton variant="ghost" onClick={() => setStep('form')} agentId="deploy-edit-button">modify.config</CLIButton>
                      <CLIButton variant="primary" onClick={handleDeploy} fullWidth icon={<Rocket className="w-4 h-4" />} loading={isDeploying} agentId="deploy-confirm-button">deploy.now()</CLIButton>
                    </div>
                  </Terminal>
                </div>
              </motion.div>
            )}


            {step === 'deploying' && (
              <motion.div
                key="deploying"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="py-12 flex flex-col items-center w-full relative"
              >
                {/* Futuristic Core Loading Animation */}
                <div className="relative mb-12 flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                    className="absolute w-40 h-40 rounded-full border-t-2 border-r-2 border-[#0052FF] opacity-30 blur-[1px]"
                  />
                  <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                    className="absolute w-36 h-36 rounded-full border-b-2 border-l-2 border-cyan-400 opacity-40 blur-[1px]"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.5, 0.2] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute w-24 h-24 rounded-full bg-[#0052FF]/20 blur-2xl"
                  />
                  <div className="w-20 h-20 bg-white dark:bg-gray-900 border border-blue-500/20 rounded-full flex items-center justify-center relative z-10 shadow-2xl">
                    <motion.div
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Rocket className="w-10 h-10 text-[#0052FF]" />
                    </motion.div>
                  </div>
                </div>

                <div className="text-center mb-8">
                  <motion.h2
                    animate={{ opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-2xl font-bold text-gray-900 dark:text-white mb-2 font-display"
                  >
                    Launching Protocol
                  </motion.h2>
                  <p className="text-xs font-mono text-[#0052FF] tracking-[0.2em] uppercase opacity-70">Broadcasting to Base Mainnet</p>
                </div>

                <div className="w-full bg-black/95 backdrop-blur-2xl rounded-2xl overflow-hidden shadow-2xl border border-blue-900/30 max-w-sm relative group">
                  <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
                    <motion.div
                      animate={{ y: ['-100%', '300%'] }}
                      transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                      className="absolute inset-x-0 h-40 bg-gradient-to-b from-transparent via-blue-500/5 to-transparent"
                    />
                  </div>
                  <div className="bg-gray-950 px-4 py-2.5 flex items-center justify-between border-b border-gray-800/50 relative z-10">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500/50" />
                      <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
                      <div className="w-2 h-2 rounded-full bg-green-500/50" />
                    </div>
                    <span className="text-[10px] font-mono text-gray-500 uppercase tracking-tighter">SDK_ENGINE_LOGS</span>
                  </div>
                  <div className="p-4 h-72 overflow-y-auto space-y-3 font-mono text-[10px] scrollbar-hide relative z-10">
                    {deployLogs.map((log, i) => (
                      <motion.div
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={i}
                        className={`pl-3 border-l ${log.startsWith('✓') ? 'text-emerald-400 border-emerald-500/30' : log.startsWith('✗') ? 'text-red-400 border-red-500/30' : 'text-blue-300 border-blue-500/30'}`}
                      >
                        <span className="text-gray-600 mr-2 opacity-50 select-none">[{i.toString().padStart(2, '0')}]</span>
                        {log}
                      </motion.div>
                    ))}
                    <motion.div
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="w-1.5 h-3 bg-[#0052FF] inline-block align-middle ml-1"
                    />
                  </div>
                </div>
              </motion.div>
            )}


            {step === 'success' && deployResult && (
              <motion.div
                key="success"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-4 flex flex-col items-center w-full"
              >
                {/* Full Width Token Celebration Card */}
                <div className="w-full relative max-w-sm mb-8">
                  {/* Outer Glow */}
                  <div className="absolute inset-0 bg-green-500/20 blur-[100px] -z-10 rounded-full" />

                  <div className="bg-white dark:bg-gray-950 rounded-[2.5rem] border border-green-500/30 p-8 shadow-2xl relative overflow-hidden group">
                    {/* Security Watermark */}
                    <div className="absolute -right-12 -top-12 opacity-[0.03] rotate-12 pointer-events-none">
                      <ClankerLogo size="lg" />
                    </div>

                    <div className="flex flex-col items-center text-center">
                      <motion.div
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", damping: 15 }}
                        className="w-20 h-20 bg-green-500 rounded-3xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(34,197,94,0.4)] rotate-3"
                      >
                        <Check className="w-10 h-10 text-white" />
                      </motion.div>

                      <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter mb-1">Genesis Complete</h2>
                      <p className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 mb-8">
                        TOKEN INDEXED ON BASE MAINNET
                      </p>

                      <div className="w-full bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 mb-6">
                        <div className="flex items-center gap-4 text-left">
                          <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-white dark:border-gray-800 shadow-sm shrink-0">
                            {config.image ? (
                              <img src={getPreviewUrl(config.image)} alt="Token" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-gray-100 flex items-center justify-center"><Coins className="w-8 h-8 text-gray-300" /></div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-black text-lg text-gray-900 dark:text-white leading-tight truncate">{config.name}</h3>
                            <p className="font-mono text-sm text-[#0052FF] font-bold">${config.symbol}</p>
                          </div>
                        </div>
                      </div>

                      <div className="w-full space-y-2">
                        <p className="text-[9px] font-mono text-gray-400 uppercase tracking-widest text-left ml-2">Smart Contract</p>
                        <div className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-3.5 rounded-2xl hover:border-blue-500/30 transition-all cursor-pointer group/addr" onClick={() => handleCopy(deployResult.tokenAddress, 'addr')}>
                          <code className="text-xs text-gray-600 dark:text-gray-400 font-mono truncate flex-1">{deployResult.tokenAddress}</code>
                          <div className="text-gray-300 group-hover/addr:text-blue-500 transition-colors">
                            {copiedField === 'addr' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Primary Actions */}
                <div className="w-full max-w-sm space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <a
                      href={`https://clanker.world/clanker/${deployResult.tokenAddress}`}
                      target="_blank"
                      className="py-4 rounded-2xl bg-[#0052FF] text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
                    >
                      <Globe className="w-4 h-4" />
                      Clanker
                    </a>
                    <a
                      href={`https://dexscreener.com/base/${deployResult.tokenAddress}`}
                      target="_blank"
                      className="py-4 rounded-2xl bg-gray-900 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all"
                    >
                      <Zap className="w-4 h-4" />
                      Trade
                    </a>
                  </div>

                  <button
                    onClick={deployAnother}
                    className="w-full py-4 rounded-2xl border-2 border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-300 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-900 transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Deploy Another Protocol
                  </button>

                  <button
                    onClick={shareToken}
                    className="w-full py-2 text-[10px] font-mono text-gray-400 uppercase tracking-widest hover:text-[#0052FF] flex items-center justify-center gap-2 transition-colors"
                  >
                    <Share2 className="w-3 h-3" /> Export Genesis Data
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="py-10 flex flex-col items-center w-full text-center"
              >
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 border-4 border-white ring-4 ring-red-50">
                  <AlertTriangle className="w-10 h-10 text-red-500" />
                </div>

                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Deployment Failed</h2>
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
                    className="w-full py-3.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium"
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
      <footer className="relative z-10 px-3 sm:px-4 py-2.5 sm:py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-gray-100/80 dark:border-gray-800/80 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <p className="font-mono text-[10px] text-gray-400 dark:text-gray-600">Clanker SDK v4</p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-gray-400 dark:text-gray-600">Base</span>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
