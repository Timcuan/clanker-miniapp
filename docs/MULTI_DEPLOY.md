# Multi-Deploy Feature Documentation

## Overview

The Clanker MiniApp now supports batch deployment of multiple tokens across multiple platforms (Telegram, Farcaster, and Web). This feature allows users to deploy up to 100 tokens in a single batch with configurable delays between deployments.

## Architecture

### Platform Detection

The app automatically detects the current platform using `lib/platform.ts`:
- **Telegram**: Uses Telegram WebApp SDK for user identification
- **Farcaster**: Uses Farcaster Frame SDK for user identification
- **Web**: Standard web access with wallet connection

### Deployment Flow

1. **Client-Side Preparation**: Tokens are validated and prepared on the client
2. **Sequential Deployment**: Tokens are deployed one by one with configurable delays
3. **Real-Time Updates**: UI shows progress for each token deployment
4. **Result Storage**: Results are saved to localStorage for history

## Configuration

### Platform-Specific Settings

Located in `config/platforms.ts`:

```typescript
// Telegram limits (mobile-friendly)
telegram: {
  maxTokensPerBatch: 50,
  deployDelay: 15, // seconds
}

// Farcaster limits (desktop)
farcaster: {
  maxTokensPerBatch: 100,
  deployDelay: 10, // seconds
}

// Web limits
web: {
  maxTokensPerBatch: 100,
  deployDelay: 5, // seconds
}
```

### Environment Variables

Add to your `.env.local`:

```env
# Multi-deploy settings
NEXT_PUBLIC_MAX_TOKENS_PER_BATCH=100
NEXT_PUBLIC_DEPLOY_DELAY_SECONDS=10
NEXT_PUBLIC_AUTO_SAVE_RESULTS=true

# Platform context
NEXT_PUBLIC_CONTEXT_INTERFACE=Clanker MiniApp
NEXT_PUBLIC_CONTEXT_PLATFORM=telegram-miniapp  # or farcaster-miniapp
```

## Usage

### Via UI

1. Navigate to `/deploy/multi`
2. Add tokens using the form:
   - Name (1-50 characters)
   - Symbol (1-10 characters)
   - Image URL (optional)
3. Configure each token's settings:
   - Paired token (default: WETH)
   - Position type (standard/project)
   - Fee type (dynamic/static)
   - MEV protection (on/off)
4. Click "Deploy Batch"

### JSON Import/Export

#### Export Format
```json
[
  {
    "name": "Token Name",
    "symbol": "SYMBOL",
    "description": "Optional description",
    "image": "https://example.com/image.png",
    "tokenAdmin": "0x...",
    "rewardRecipient": "0x...",
    "pairedToken": "WETH",
    "positionType": "standard",
    "feeType": "dynamic",
    "mevProtection": true
  }
]
```

#### Import Steps
1. Click "Import" button
2. Paste JSON array of tokens
3. Click "Import" to validate and load
4. Review and deploy

## API Integration

### Deployment Hook

The `useBatchDeploy` hook handles all deployment logic:

```typescript
const {
  isDeploying,
  currentDeployIndex,
  results,
  platform,
  deployBatch,
  getHistory,
  clearHistory,
} = useBatchDeploy();
```

### Server-Side Signing

Wallet operations use server-side session management:
- Private keys never leave the server
- Message signing via `/api/wallet/sign`
- Transaction signing handled by Clanker SDK

## Deployment Scripts

### Telegram
```bash
chmod +x scripts/deploy-telegram.sh
./scripts/deploy-telegram.sh staging   # or production
```

### Farcaster
```bash
chmod +x scripts/deploy-farcaster.sh
./scripts/deploy-farcaster.sh staging   # or production
```

## Security Considerations

1. **Input Validation**: All token inputs are validated using Zod schemas
2. **Rate Limiting**: Sequential deployment with delays prevents rate limit issues
3. **Session Management**: Wallet sessions expire after configured time
4. **XSS Prevention**: JSON import is sanitized before processing

## Troubleshooting

### Common Issues

1. **"Wallet not connected"**
   - Ensure wallet is connected before deploying
   - Check session hasn't expired

2. **"Maximum tokens per batch exceeded"**
   - Check platform-specific limits
   - Reduce batch size

3. **"Failed to deploy token X"**
   - Check token configuration
   - Ensure sufficient ETH balance
   - Verify network connectivity

### Debug Mode

Enable debug logging:
```env
NEXT_PUBLIC_DEBUG=true
```

## Future Enhancements

1. **Parallel Deployment**: Option for parallel deployment with rate limiting
2. **Template System**: Predefined token templates
3. **Advanced Configuration**: More granular pool and fee settings
4. **Database Storage**: Persistent deployment history
5. **Analytics**: Deployment success rates and timing metrics
