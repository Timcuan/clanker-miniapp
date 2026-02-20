# Application Visual Flow & Architecture

This application operates as a Serverless Next.js Application wrapping the Telegram Web App ecosystem. It interacts heavily with localized zero-knowledge states, communicating solely with the Base Blockchain layer strictly via client-side API derivations. 

## Component Workflows

### 1. Authentication & Security Pipeline
```mermaid
sequenceDiagram
    participant User
    participant Telegram WebApp
    participant LocalStorage
    participant WalletContext
    participant Blockchain
    
    User->>Telegram WebApp: Opens Application
    Telegram WebApp->>WalletContext: Fetch InitData ID & Signatures
    WalletContext->>LocalStorage: Request 'clanker_wallets' array
    alt Keys Present
        LocalStorage-->>WalletContext: Decrypts & Mounts Active Wallet
        WalletContext->>Blockchain: Request Wallet ETH Balance
        Blockchain-->>WalletContext: Returns Live Balance
    else Keys Absent
        WalletContext-->>User: Prompts Terminal to Import/Generate
    end
```

### 2. Deployment Processing 
```mermaid
graph TD
    A[Deploy Page Form] -->|Validates Input| B(Wallet Context Checks)
    B -->|Has ETH| C{Custom RPC Cached?}
    B -->|No ETH| Z[Throw Front-End Gas Warning]
    
    C -->|Yes| D[Inject Alchemy/QuickNode URL]
    C -->|No| E[Use https://mainnet.base.org]
    
    D --> F
    E --> F
    
    F[Assemble Clanker SDK payload] -->|Sign Local| G(Viems client sends TX)
    G --> H[Clanker Contract execution]
    H --> I[History Page Indexed]
```

## System Modules
*   `contexts/WalletContext.tsx`: The heart of the application. Secures multi-wallet logic locally, processes Viem initialization dynamically based on Custom RPC overrides, and polls live balances.
*   `app/api/deploy/route.ts`: A secondary fallback integration for server-side relays when strict local derivations are unfavorable.
*   `lib/clanker/config.ts`: Modifies pool sizes, custom BPS static fees, and extracts Telegram user environments before interacting with Clankers API definitions.
