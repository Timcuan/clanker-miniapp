# Changelog

## [1.1.0] - 2026-02-18

### 🚀 Major Upgrades
- **Framework**: Upgraded to **Next.js 15.1.0** for better performance and Turbopack support.
- **Library**: Upgraded to **React 19.0.0** and **React DOM 19.0.0**.
- **Database**: Migrated session and user persistence to **Turso (libSQL)** for edge compatibility.
- **SDK**: Updated **Clanker SDK** to **v4.2.10** with improved stability.
- **Icons**: Upgraded **lucide-react** to **v0.574.0**.

### ✨ Features
- **Persistent Preferences**: Deployment configurations (Block Delay, Fee Type, etc.) are now saved locally.
- **Admin Dashboard**: New interactive `/start` command for admins with quick actions.
- **Modern UI**: Cleaned up the terminal experience, optimized for mobile Telegram MiniApps.

### 🔧 Fixes & Optimizations
- **Build Errors**: Fixed async `cookies()` and `headers()` calls for Next.js 15 compatibility.
- **Typing**: Added strict typing for db row mappings and Zod schema error handling.
- **Performance**: Reduced bundle size by removing unused UI effects and optimizing imports.
- **Security**: Hardened access control with user-bound session cookies.

### 📦 Dependencies Update
- `viem` -> `~2.46.2`
- `wagmi` -> `^3.5.0`
- `framer-motion` -> `^12.34.2`
- `zod` -> `^3.23.8`
