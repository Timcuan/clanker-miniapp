# UMKM Terminal v2.0

Professional Token Deployer for Base Network, optimized for Telegram MiniApp.

## Features

- **Netlify Native** - Optimized for high-performance edge deployment on Netlify.
- **Telegram Focused** - Native integration with Telegram MiniApp and Webhooks.
- **Hardened Security** - Administrator-only access control (No public access codes).
- **One-Click Deploy** - Streamlined token deployment on Base via Clanker SDK V4.
- **Embedded Wallet** - Secure in-app wallet generation and persistent sessions.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Vanilla CSS + Tailwind
- **Database**: Turso (Edge SQLite)
- **Blockchain**: viem 2.x, Clanker SDK V4
- **Platform**: Netlify Edge Functions

## Deployment (Netlify)

1. Connect repository to Netlify.
2. Configure Environment Variables:
   - `TELEGRAM_BOT_TOKEN`
   - `PRIMARY_ADMIN_ID`
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `ENCRYPTION_KEY`
3. Run `npx netlify deploy --prod`.

## Access Control

Access is managed exclusively through the Telegram bot. Administrators use the `/grant [ID]` command to authorize users. Public registration and access code entry are disabled for maximum security.

## License

Private / UMKM
