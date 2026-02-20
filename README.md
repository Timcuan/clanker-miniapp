# Clanker Terminal

Professional Token Deployer for Base Network using Clanker SDK V4.

## Features

- **Quick Deploy** - Single token deployment with full SDK parameters
- **Multi Deploy** - Batch deployment up to 100 tokens
- **Template Deploy** - Deploy from JSON configuration
- **Private Key Wallet** - Secure encrypted session management
- **MEV Protection** - Block delay to prevent snipers
- **Earn Rewards** - Automatic trading fee collection
- **Clanker Verified** - All tokens verified on clanker.world
- **Deploy Templates** - Save and reuse deployment configurations

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, TailwindCSS, Framer Motion
- **Database**: SQLite (better-sqlite3) with encrypted sessions
- **Blockchain**: viem, Clanker SDK V4, Base network
- **UI**: Custom terminal-style components with Matrix effects

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required variables:
- `ENCRYPTION_KEY` - Generate with: `openssl rand -base64 32`
- `NEXT_PUBLIC_RPC_URL` - Base RPC URL (default: https://mainnet.base.org)

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Test in Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather)
2. Set the Web App URL to your deployed URL
3. Open the bot and click the menu button

## Project Structure

```
clanker-miniapp/
├── app/                    # Next.js App Router
│   ├── deploy/             # Deploy pages
│   │   ├── quick/          # Quick single deploy
│   │   ├── multi/          # Multi-token deploy
│   │   └── template/       # Template deploy
│   └── api/                # API routes
├── components/             # React components
│   ├── ui/                 # shadcn/ui components
│   ├── deploy/             # Deploy components
│   └── layout/             # Layout components
├── lib/                    # Utilities
│   ├── clanker/            # Clanker SDK wrapper
│   ├── wallet/             # Wallet config
│   └── telegram/           # Telegram helpers
├── hooks/                  # Custom hooks
└── types/                  # TypeScript types
```

## Deployment

### Netlify (Recommended)

1. Connect your GitHub repository to Netlify
2. Set environment variables in Netlify dashboard
3. Deploy automatically on push

### Vercel

```bash
npm run build
vercel deploy
```

### Environment Variables for Production

Set these in your deployment platform:

```env
ENCRYPTION_KEY=your-secure-32-byte-key
NEXT_PUBLIC_RPC_URL=https://mainnet.base.org
NEXT_PUBLIC_CHAIN_ID=8453
```

## Configuration

### Token Defaults

Set in `.env.local`:

```env
NEXT_PUBLIC_MEV_MODULE_TYPE=BlockDelay
NEXT_PUBLIC_BLOCK_DELAY=8
NEXT_PUBLIC_FEE_TYPE=dynamic
NEXT_PUBLIC_MAX_TOKENS_PER_BATCH=100
NEXT_PUBLIC_DEPLOY_DELAY_SECONDS=10
```

### Wallet Options

1. **Privy (Recommended)** - Embedded wallet with social login
2. **WalletConnect** - External wallets (MetaMask, Rainbow, etc.)

## License

MIT
