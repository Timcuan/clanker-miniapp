# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-02-19
### Added
- **Colored Buttons**: Implemented Telegram Bot API 9.4 `style` property for inline keyboard buttons (Success, Primary, Secondary).
- **Wallet Management**: Added ability to switch between saved wallets in Settings without re-login.
- **Telegram Access**: Added fallback "Open Web App" button for better accessibility.
- **Dark Mode**: Fixed overlay background transparency issues.
- **USD Balance Display**: Real-time ETH-USD conversion on Home and Deploy pages.

### Changed
- Refactored `/start` command to use a cleaner, emoji-free layout with dual keyboards (Inline + Reply).
- Updated `CLIButton` component with new variants (`success`, `info`, `warning`, `danger`).
- Simplified Mini App Home screen (removed colorful menu).
- bumped version to 1.1.1.

## [1.0.0] - 2026-02-18
### Added
- Initial Release of Clanker MiniApp.
- Basic deployment features.
- Telegram Bot Webhook integration.
