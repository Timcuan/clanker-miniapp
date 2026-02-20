# Changelog

All notable changes to this project will be documented in this file.

## [1.2.1] - 2026-02-20
### Added
- **Custom Base RPC URL**: Override the default network node (`mainnet.base.org`) via `Settings` to integrate fast private infrastructure (e.g., Alchemy, QuickNode, Infura).
- **Telegram Cloud Sync**: Opt-in framework (`window.Telegram.WebApp.CloudStorage`) to synchronize `ThemeProvider` preferences and UX layouts dynamically across devices without transmitting private keys.
- **Factory Reset Protocol (Danger Zone)**: Advanced local cache destruction utility inside `app/settings/page.tsx` for securing offline environments.

### Changed
- Refactored `DeployService` arguments schema to natively inject `customRpcUrl`.
- Reordered default `WalletContext` network nodes to fall back gracefully upon custom node instantiation errors.
- Augmented `/settings` page layout with categorized subheaders (`Network Integration`, `Danger Zone`).

## [1.2.0] - 2026-02-20
### Added
- DexScreener Public API integration for Live Price, Total Volume & 24hr Liquidity inside `/history`.
- "External Profiles" redirection linking to defined.fi profile analytics natively in `/history`.
- Futuristic framer-motion animations inside `/deploy` execution state.

### Fixed
- Base Terminal Dark Mode Contrast Ratio for `output`, `success`, and `error` flags.
- `ETH Balance` font-coloring bugs during Dark Mode toggle.
- Coinbase CORS isolation failures inside `app/page.tsx` by pivoting to DexScreener WETH pair reads.
