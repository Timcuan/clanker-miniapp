# Clanker MiniApp - Architecture & Flow

## 🎯 Overview

Telegram MiniApp untuk deploy token menggunakan Clanker SDK V4.
Semua fitur CLI diimplementasikan dalam UI yang mobile-friendly.

## 🔄 User Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        TELEGRAM MINIAPP FLOW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. USER OPENS MINIAPP                                                  │
│     └── Telegram WebApp SDK initialized                                 │
│         └── Check if wallet connected                                   │
│                                                                         │
│  2. WALLET CONNECTION                                                   │
│     ├── Option A: WalletConnect (External Wallet)                       │
│     │   └── MetaMask, Rainbow, Coinbase Wallet                          │
│     ├── Option B: Privy (Embedded Wallet)                               │
│     │   └── Email/Social login → Auto-create wallet                     │
│     └── Option C: Telegram Wallet (TON → Bridge to Base)                │
│                                                                         │
│  3. DEPLOY MODE SELECTION                                               │
│     ├── 🚀 Quick Deploy (Single Token)                                  │
│     ├── 📦 Multi Deploy (Batch Tokens)                                  │
│     └── 📝 Template Deploy (From JSON)                                  │
│                                                                         │
│  4. TOKEN CONFIGURATION                                                 │
│     ├── Basic Info: Name, Symbol, Image                                 │
│     ├── Admin Settings: Token Admin, Reward Recipient                   │
│     ├── Pool Config: WETH Paired, Standard/Custom Positions             │
│     ├── Fee Config: Dynamic (1-5%) or Static                            │
│     └── MEV Protection: Block Delay (8 blocks)                          │
│                                                                         │
│  5. DEPLOYMENT                                                          │
│     ├── Preview & Confirm                                               │
│     ├── Server-side Deployment (via /api/deploy)                        │
│     ├── Wait for confirmation                                           │
│     └── Show success with links (BaseScan, Clanker, GMGN)               │
│                                                                         │
│  6. POST-DEPLOY                                                         │
│     ├── Share to Telegram/Twitter                                       │
│     ├── View on Clanker.world                                           │
│     └── Claim Rewards (future)                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 🏗️ Tech Stack

```
Frontend:
├── Next.js 14 (App Router)
├── TypeScript
├── TailwindCSS + shadcn/ui
├── Telegram WebApp SDK
└── Framer Motion (animations)

Wallet & Security:
├── Session-based Wallet Management (Server-side signing)
├── Stateless Clanker Service (No memory persistence)
└── Encrypted Session Cookies (Secure key storage)

Backend:
├── Next.js API Routes
├── Clanker SDK V4 (Core deployment)
└── Telegram Bot API (notifications)

Storage:
├── IPFS (via Pinata for metadata)
└── Serverless Encrypted Cookies (Session state)
```

## 📁 Project Structure

```
clanker-miniapp/
├── 📂 app/                      # Next.js App Router
│   ├── layout.tsx               # Root layout with providers
│   ├── page.tsx                 # Home/Landing
│   ├── 📂 deploy/               # Deploy pages
│   │   └── page.tsx             # Main deploy interface
│   ├── 📂 history/              # Deployment history
│   └── 📂 api/                  # API routes
│       ├── deploy/route.ts      # Deploy endpoint (Server-side)
│       ├── telegram/route.ts    # Telegram webhook
│       └── wallet/route.ts      # Wallet session management
│
├── 📂 components/               # React components
│   ├── 📂 ui/                   # shadcn/ui components
│   ├── 📂 deploy/               # Deploy-specific components
│   │   ├── TokenForm.tsx        # Token input form (if separated)
│   │   └── Terminal.tsx         # CLI-style container
│   └── 📂 layout/               # Layout components
│       ├── Header.tsx
│       ├── Navigation.tsx
│       └── TelegramProvider.tsx
│
├── 📂 lib/                      # Utilities & SDK
│   ├── 📂 clanker/              # Clanker SDK wrapper
│   │   ├── sdk.ts               # Stateless Service
│   │   ├── deployer.ts          # Core deployment logic
│   │   ├── config.ts            # Token config builders
│   │   └── constants.ts         # Pool positions, fees
│   ├── 📂 telegram/             # Telegram utilities
│   │   ├── webapp.ts            # WebApp SDK helpers
│   │   └── bot.ts               # Bot API helpers
│   ├── session-store.ts         # Session helpers
│   └── serverless-db.ts         # Encrypted cookie DB
│
├── 📂 hooks/                    # Custom React hooks
│   ├── useDeploy.ts             # Deploy logic hook
│   ├── useWallet.ts             # Wallet state hook
│   └── useTelegram.ts           # Telegram WebApp hook
│
├── 📂 types/                    # TypeScript types
│
├── 📂 public/                   # Static assets
│   └── images/
│
├── .env.local                   # Local environment
├── .env.example                 # Environment template
├── package.json
└── next.config.js
```

## 🔐 Wallet Connection Strategy

To ensure maximum security and usability, the app uses a **Secure Burner Wallet** strategy:

1.  **No Private Key Input (Recommended):** Users are encouraged to "Create New Wallet".
    *   Server generates a fresh key pair.
    *   Key is encrypted and stored in an HTTP-only Local Session Cookie.
    *   Key is shown to the user **once** for backup.
    *   This isolates risk to only the funds deposited in this MiniApp.

2.  **Telegram Authentication:**
    *   All wallet operations are authenticated using Telegram's `initData` (HMAC validation).
    *   Ensures typically 1-to-1 mapping between Telegram User and Session Wallet.

3.  **Transport Security:**
    *   HTTPS + Secure Cookies prevent network sniffing.
    *   Private keys are never exposed to client-side JS after the initial backup step.

## 🌐 Environment Variables

```env
# ============================================
# TELEGRAM CONFIGURATION
# ============================================
TELEGRAM_BOT_TOKEN=your_bot_token
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=your_bot_username

# ============================================
# WALLET CONFIGURATION
# ============================================
# Privy (Recommended for MiniApp)
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_secret

# WalletConnect (Optional - External Wallets)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_wc_project_id

# ============================================
# BLOCKCHAIN CONFIGURATION
# ============================================
NEXT_PUBLIC_CHAIN_ID=8453
NEXT_PUBLIC_RPC_URL=https://mainnet.base.org

# ============================================
# CLANKER SDK CONFIGURATION
# ============================================
# Default token settings (can be overridden in UI)
NEXT_PUBLIC_DEFAULT_TOKEN_ADMIN=0x...
NEXT_PUBLIC_DEFAULT_REWARD_RECIPIENT=0x...
NEXT_PUBLIC_DEFAULT_IMAGE=ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi

# MEV Protection
NEXT_PUBLIC_MEV_MODULE_TYPE=BlockDelay
NEXT_PUBLIC_BLOCK_DELAY=8

# Fee Configuration
NEXT_PUBLIC_FEE_TYPE=dynamic
NEXT_PUBLIC_STARTING_SNIPER_FEE=100
NEXT_PUBLIC_ENDING_SNIPER_FEE=500

# ============================================
# DEPLOYMENT CONFIGURATION
# ============================================
NEXT_PUBLIC_MAX_TOKENS_PER_BATCH=100
NEXT_PUBLIC_DEPLOY_DELAY_SECONDS=10

# ============================================
# OPTIONAL - ANALYTICS & MONITORING
# ============================================
NEXT_PUBLIC_POSTHOG_KEY=your_posthog_key
SENTRY_DSN=your_sentry_dsn
```

## 🚀 Deployment Flow (Technical)

```typescript
// 1. User fills form → TokenConfig (Client)
const config = { name: "My Token", symbol: "MTK", ... };

// 2. Client sends config to API (POST /api/deploy)
await fetch('/api/deploy', {
  method: 'POST',
  body: JSON.stringify(config)
});

// 3. Server receives request (API Route)
//    a. Decrypts session to get private key
//    b. Validates inputs
//    c. Initializes Stateless ClankerService

// 4. ClankerService executes deployment (Server)
//    a. helper: getClankerClient(privateKey)
//    b. helper: buildTokenConfig(input)
//    c. client.deploy(tokenConfig)

// 5. Response sent back to Client with txHash and tokenAddress
```

## 📱 Telegram Integration

```typescript
// Initialize Telegram WebApp
import { WebApp } from '@twa-dev/sdk';

// Get user info
const user = WebApp.initDataUnsafe.user;

// Theme adaptation
const isDark = WebApp.colorScheme === 'dark';

// Main button for deploy
WebApp.MainButton.setText('Deploy Token');
WebApp.MainButton.onClick(() => handleDeploy());

// Back button
WebApp.BackButton.show();
WebApp.BackButton.onClick(() => router.back());

// Haptic feedback
WebApp.HapticFeedback.impactOccurred('medium');

// Share result
WebApp.openTelegramLink(`https://t.me/share/url?url=${shareUrl}`);
```
