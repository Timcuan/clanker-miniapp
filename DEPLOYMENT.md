# Deployment Guide: Turso + Cloudflare Pages

## 📋 Prerequisites

1. [Turso CLI](https://docs.turso.tech/cli/installation)
2. [Cloudflare Account](https://dash.cloudflare.com)
3. [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

---

## 🗄️ Step 1: Setup Turso Database

### Install Turso CLI
```bash
# macOS
brew install tursodatabase/tap/turso

# Linux
curl -sSfL https://get.tur.so/install.sh | bash
```

### Create Database
```bash
# Login to Turso
turso auth login

# Create database
turso db create clanker-miniapp

# Get database URL
turso db show clanker-miniapp --url

# Create auth token
turso db tokens create clanker-miniapp
```

### Initialize Schema
```bash
# Set environment variables
export TURSO_DATABASE_URL="libsql://your-db.turso.io"
export TURSO_AUTH_TOKEN="your-token"

# Run init script
pnpm db:init
```

---

## ☁️ Step 2: Setup Cloudflare Pages

### Login to Wrangler
```bash
npx wrangler login
```

### Create Pages Project
```bash
npx wrangler pages project create clanker-miniapp
```

### Set Environment Variables
Go to Cloudflare Dashboard → Pages → clanker-miniapp → Settings → Environment Variables:

```
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
TELEGRAM_BOT_TOKEN=your-bot-token
NEXT_PUBLIC_APP_URL=https://clanker-miniapp.pages.dev
ADMIN_TELEGRAM_IDS=your-telegram-id
ENCRYPTION_KEY=your-32-char-key
```

---

## 🚀 Step 3: Deploy

### Build for Cloudflare Pages
```bash
pnpm pages:build
```

### Deploy
```bash
pnpm pages:deploy
```

---

## 🤖 Step 4: Setup Telegram Bot Webhook

After deployment, set the webhook URL:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://clanker-miniapp.pages.dev/api/telegram/webhook"}'
```

---

## 📁 Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `TURSO_DATABASE_URL` | Turso database URL | ✅ |
| `TURSO_AUTH_TOKEN` | Turso auth token | ✅ |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | ✅ |
| `NEXT_PUBLIC_APP_URL` | Your deployed app URL | ✅ |
| `ADMIN_TELEGRAM_IDS` | Comma-separated admin Telegram IDs | ✅ |
| `ENCRYPTION_KEY` | 32-character encryption key | ✅ |

---

## 🔧 Local Development

```bash
# Install dependencies
pnpm install

# Set environment variables in .env.local
cp .env.example .env.local

# Run development server
pnpm dev
```

---

## 📊 Database Schema

### Users Table
- `id` - Primary key
- `telegram_id` - Telegram user ID (unique)
- `username` - Telegram username
- `first_name` - User's first name
- `access_code` - Access code for authentication
- `is_admin` - Admin flag
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### Sessions Table
- `id` - Primary key
- `user_id` - Foreign key to users
- `token` - Session token
- `expires_at` - Expiration timestamp

### Deployments Table
- `id` - Primary key
- `user_id` - Foreign key to users
- `token_address` - Deployed token address
- `token_name` - Token name
- `token_symbol` - Token symbol
- `token_image` - Token image URL
- `pool_address` - Uniswap pool address
- `tx_hash` - Transaction hash
- `status` - Deployment status
- `status` - Deployment status
- `created_at` - Creation timestamp

---

## 🎨 2024 Revamp Details

The application has been upgraded with:
- **Next.js 16 + React 19**: Modern performance and streaming.
- **Improved Telegram Bot**: Rich UI, admin commands, and better session management.
- **Enhanced Deployment System**: Persistent user preferences and direct client-side deployment.
- **Turso Database Integration**: Edge-compatible SQL storage for high performance.
