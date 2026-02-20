# Clanker MiniApp Terminal 🚀

A highly optimized, Next.js 15 powered Telegram Mini Application for deploying and managing tokens on the Base network using the Clanker SDK. Designed with a sleek, futuristic CLI aesthetic, it prioritizes speed, security, and power-user customization.

## Key Features
* **Lightning Fast Deployments**: 1-click token deployments to Base Mainnet using Clanker SDK v4.
* **Non-Custodial Local Security**: Private keys are securely encrypted and kept purely on the local `localStorage` of your device. 
* **Zero-Knowledge Cloud Sync (Beta)**: Synchronizes UI Preferences (like Advanced Mode and Themes) across Telegram devices via `CloudStorage`—without ever transmitting your Private Keys.
* **Custom RPC Power**: Bypass rate limits by overriding the default Base Mainnet node with your own Alchemy/QuickNode endpoints.
* **Holistic Analytics Dashboard**: Integrated with DexScreener and Clanker World APIs to monitor real-time token price, volume, and liquidity natively in the `/history` tab.

## Quick Start (Development)

```bash
# Clone the repository
git clone https://github.com/Timcuan/clanker-miniapp.git
cd clanker-miniapp

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env.local

# Run the development server
npm run dev
```

## Production Deployment (Netlify)
This repository is pre-configured for seamless integration with Netlify.
1. Connect this repository to your Netlify account.
2. Under "Build settings", ensure the command is `npm run build` and publish directory is `.next`.
3. Configure the Environment Variables present in `.env.example` inside your Netlify Dashboard.

## Architecture & Visual Flow
Please refer to `ARCHITECTURE.md` for a comprehensive breakdown of the component pipelines and frontend-backend interactions.

## Security (Danger Zone)
The application includes a prominent **Factory Reset** function within the Settings tab that securely wipes all instances of `localStorage` caches and telegram `CloudStorage` keys, safely obliterating device data history for public terminals or compromised environments.

---
_Powered by Base and the Clanker Protocol._
