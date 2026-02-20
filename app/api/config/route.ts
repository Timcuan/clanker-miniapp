import { NextRequest, NextResponse } from 'next/server';

// Default config - SQLite disabled for serverless
const defaultConfig = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org',
  chainId: 8453,
  networkName: 'Base Mainnet',
  // Deploy defaults
  defaultFeeType: 'dynamic',
  defaultPoolPosition: 'Standard',
  defaultMevProtection: 'BlockDelay',
  defaultBlockDelay: 8,
  defaultDevBuyEth: 0,
  // Template defaults
  templateDescription: null as string | null,
  templateWebsite: null as string | null,
  templateTwitter: null as string | null,
  templateTelegram: null as string | null,
  templateCreatorReward: 0,
  // Default addresses
  defaultTokenAdmin: null as string | null,
  defaultRewardRecipient: null as string | null,
  // UI preferences
  autoFillTemplate: true,
  showAdvancedOptions: false,
};

// GET - Get default config (SQLite disabled for Vercel)
export async function GET() {
  return NextResponse.json(defaultConfig);
}

// POST - Config update disabled for serverless
export async function POST(request: NextRequest) {
  // Just acknowledge - config stored client-side
  try {
    await request.json();
    return NextResponse.json({ success: true, message: 'Config stored client-side' });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
