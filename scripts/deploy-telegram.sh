#!/bin/bash

# Deployment script for Telegram MiniApp
# Usage: ./scripts/deploy-telegram.sh [staging|production]

set -e

ENVIRONMENT=${1:-staging}
echo "Deploying Clanker MiniApp for Telegram ($ENVIRONMENT)..."

# Check if required environment variables are set
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "❌ Error: TELEGRAM_BOT_TOKEN is required"
    exit 1
fi

if [ -z "$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME" ]; then
    echo "❌ Error: NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is required"
    exit 1
fi

# Build the application
echo "Building application..."
npm run build

# Environment-specific configurations
case $ENVIRONMENT in
    "staging")
        echo "🔧 Deploying to staging..."
        vercel --scope clanker-miniapp --env NEXT_PUBLIC_PLATFORM=telegram-staging
        # Update Telegram bot commands for staging
        curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setMyCommands" \
            -H "Content-Type: application/json" \
            -d '{
                "commands": [
                    {"command": "start", "description": "🚀 Start deploying tokens"},
                    {"command": "deploy", "description": "📦 Quick deploy"},
                    {"command": "history", "description": "📜 View deployments"},
                    {"command": "help", "description": "❓ Get help"}
                ],
                "scope": {"type": "default"}
            }'
        ;;
    "production")
        echo "🎯 Deploying to production..."
        vercel --scope clanker-miniapp --prod --env NEXT_PUBLIC_PLATFORM=telegram
        # Update Telegram bot commands for production
        curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setMyCommands" \
            -H "Content-Type: application/json" \
            -d '{
                "commands": [
                    {"command": "start", "description": "Main Terminal Overview"},
                    {"command": "deploy", "description": "Start Token Deployment"},
                    {"command": "history", "description": "Your Token History"},
                    {"command": "settings", "description": "Manage Wallets & Prefs"},
                    {"command": "help", "description": "Get Help"}
                ],
                "scope": {"type": "default"}
            }'
        ;;
    *)
        echo "❌ Invalid environment. Use 'staging' or 'production'"
        exit 1
        ;;
esac

# Set Telegram WebApp Menu Button
echo "🔘 Setting MiniApp Menu Button..."
WEBHOOK_URL="https://clanker-miniapp.pages.dev" # Replace with your actual production domain
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setChatMenuButton" \
    -H "Content-Type: application/json" \
    -d "{
        \"menu_button\": {
            \"type\": \"web_app\",
            \"text\": \"Terminal\",
            \"web_app\": { \"url\": \"$WEBHOOK_URL\" }
        }
    }"

echo "✅ Deployment complete!"
echo "🔗 MiniApp URL: https://t.me/$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?startapp"
echo "🔗 Webhook: $WEBHOOK_URL"
