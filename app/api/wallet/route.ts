import { NextRequest, NextResponse } from 'next/server';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';
import { cookies } from 'next/headers';
import { encodeSession, getSessionCookieName, createSessionData } from '@/lib/serverless-db';
import { sendAdminLog } from '@/lib/access-control';
import { validateTelegramWebAppData, parseTelegramWebAppData } from '@/lib/telegram/auth';
import { getAuthStatus } from '@/lib/auth-server';

// Helper to get Telegram user ID from request headers or query
function getTelegramUserId(request: NextRequest): number | undefined {
  // Check header first (set by client)
  const headerUserId = request.headers.get('x-telegram-user-id');
  if (headerUserId) {
    const parsed = parseInt(headerUserId, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // Check query param as fallback
  const queryUserId = request.nextUrl.searchParams.get('telegramUserId');
  if (queryUserId) {
    const parsed = parseInt(queryUserId, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return undefined;
}

function validatePrivateKey(key: string): boolean {
  // Accept with or without 0x prefix
  const cleanKey = key.startsWith('0x') ? key : `0x${key}`;
  return /^0x[a-fA-F0-9]{64}$/.test(cleanKey);
}

function normalizePrivateKey(key: string): `0x${string}` {
  return (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`;
}

function getPublicClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
  });
}

// GET - Check wallet status and get balance
export async function GET(request: NextRequest) {
  try {
    const telegramUserId = getTelegramUserId(request);
    if (!telegramUserId) {
      return NextResponse.json({ connected: false, address: null });
    }

    const auth = await getAuthStatus(telegramUserId);

    if (!auth.sessionData) {
      return NextResponse.json({ connected: false, address: null });
    }

    const session = auth.sessionData;

    // Get balance
    let balance = null;
    let balanceWei = null;
    try {
      const client = getPublicClient();
      const balanceResult = await client.getBalance({ address: session.address as `0x${string}` });
      balance = formatEther(balanceResult);
      balanceWei = balanceResult.toString();
    } catch (e) {
      console.error('Failed to fetch balance:', e);
    }

    // Calculate session expiry info
    const expiresIn = Math.floor((session.expiresAt - Date.now()) / 1000);
    const expiresInDays = Math.floor(expiresIn / (24 * 60 * 60));
    const expiresInHours = Math.floor((expiresIn % (24 * 60 * 60)) / (60 * 60));

    const response = NextResponse.json({
      connected: true,
      address: session.address,
      telegramUserId: session.telegramUserId,
      balance,
      balanceWei,
      session: {
        expiresIn,
        expiresInFormatted: expiresInDays > 0
          ? `${expiresInDays}d ${expiresInHours}h`
          : `${expiresInHours}h`,
      },
    });

    // Ensure cookie is synced (Persistence Hardening)
    const cookieName = getSessionCookieName(telegramUserId);
    const cookieStore = await cookies();
    if (!cookieStore.get(cookieName)) {
      const encrypted = encodeSession(auth.sessionData);
      response.cookies.set(cookieName, encrypted, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('Wallet GET error:', error);
    return NextResponse.json({ connected: false, address: null });
  }
}

// POST - Connect wallet with private key
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { privateKey, telegramUserId: bodyTelegramUserId, telegramUsername, initData } = body;

    // Get Telegram user ID from header, query, or body
    let telegramUserId = getTelegramUserId(request) || bodyTelegramUserId;

    // Validate via Telegram InitData if provided (More Secure)
    if (initData) {
      const isValid = validateTelegramWebAppData(initData, process.env.TELEGRAM_BOT_TOKEN);
      if (!isValid) {
        console.warn('Invalid initData provided', { telegramUserId });
        // We continue if key is valid but ideally block?
        // For strict security: return NextResponse.json({ error: 'Auth failed' }, { status: 401 });
      } else {
        const user = parseTelegramWebAppData(initData);
        if (user && user.id) {
          telegramUserId = user.id; // Trust the validated ID over the body ID
        }
      }
    }

    if (!privateKey) {
      return NextResponse.json({ error: 'Private key is required' }, { status: 400 });
    }

    if (!validatePrivateKey(privateKey)) {
      return NextResponse.json(
        { error: 'Invalid private key format. Must be 64 hex characters (with or without 0x prefix).' },
        { status: 400 }
      );
    }

    // Normalize and create account from private key
    const normalizedKey = normalizePrivateKey(privateKey);
    const account = privateKeyToAccount(normalizedKey);

    // Create session data with Telegram user ID
    const sessionData = createSessionData(normalizedKey, account.address, telegramUserId);
    const encryptedSession = encodeSession(sessionData);

    // PERSISTENCE: Save to database if Telegram user ID is present
    if (telegramUserId) {
      const { updateUser, findUserByTelegramId } = await import('@/lib/db/turso');
      const user = await findUserByTelegramId(telegramUserId);
      if (user) {
        await updateUser(telegramUserId, {
          wallet_address: account.address,
          encrypted_session: encryptedSession,
          username: telegramUsername || undefined
        });
      } else {
        // Create user if not exists (unlikely in normal flow but good for robustness)
        const { createUser } = await import('@/lib/db/turso');
        await createUser(telegramUserId, telegramUsername, undefined);
        await updateUser(telegramUserId, {
          wallet_address: account.address,
          encrypted_session: encryptedSession
        });
      }
    }

    // Get unique cookie name for this Telegram user
    const sessionCookieName = getSessionCookieName(telegramUserId);

    // Log wallet connection to admin
    sendAdminLog(
      `<b>Wallet Connected</b>\n` +
      `User: ${telegramUsername || 'Unknown'}\n` +
      `TG ID: ${telegramUserId || 'N/A'}\n` +
      `Address: <code>${account.address.slice(0, 10)}...${account.address.slice(-8)}</code>\n` +
      `Time: ${new Date().toISOString()}`
    );

    // Set session cookie
    const response = NextResponse.json({
      success: true,
      address: account.address,
      telegramUserId,
    });

    response.cookies.set(sessionCookieName, encryptedSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Wallet POST error:', error);
    return NextResponse.json(
      { error: 'Failed to connect wallet. Please check your private key.' },
      { status: 500 }
    );
  }
}

// PUT - Generate New Wallet (Secure & Easy)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { telegramUserId: bodyTelegramUserId, telegramUsername, initData } = body;

    let telegramUserId = getTelegramUserId(request) || bodyTelegramUserId;

    // Validation is CRITICAL for generation to associate with correct user
    if (initData) {
      const isValid = validateTelegramWebAppData(initData, process.env.TELEGRAM_BOT_TOKEN);
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid Telegram authentication data' }, { status: 401 });
      }
      const user = parseTelegramWebAppData(initData);
      if (user && user.id) {
        telegramUserId = user.id;
      }
    }

    // Generate new private key
    const newPrivateKey = generatePrivateKey();
    const account = privateKeyToAccount(newPrivateKey);

    // Create secure session immediately
    const sessionData = createSessionData(newPrivateKey, account.address, telegramUserId);
    const encryptedSession = encodeSession(sessionData);

    // PERSISTENCE: Save to database if Telegram user ID is present
    if (telegramUserId) {
      const { updateUser, findUserByTelegramId, createUser } = await import('@/lib/db/turso');
      const user = await findUserByTelegramId(telegramUserId);
      if (user) {
        await updateUser(telegramUserId, {
          wallet_address: account.address,
          encrypted_session: encryptedSession,
          username: telegramUsername || undefined
        });
      } else {
        await createUser(telegramUserId, telegramUsername, undefined);
        await updateUser(telegramUserId, {
          wallet_address: account.address,
          encrypted_session: encryptedSession
        });
      }
    }

    // Get unique cookie name for this Telegram user
    const sessionCookieName = getSessionCookieName(telegramUserId);

    // Response with Private Key ONLY ONCE
    const response = NextResponse.json({
      success: true,
      address: account.address,
      privateKey: newPrivateKey, // Only time this is shown to user
      telegramUserId,
      generated: true
    });

    response.cookies.set(sessionCookieName, encryptedSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days for generated wallets
      path: '/',
    });

    // Log generation (without key)
    sendAdminLog(
      `<b>New Wallet Generated</b>\n` +
      `User: ${telegramUsername || 'Unknown'}\n` +
      `TG ID: ${telegramUserId || 'N/A'}\n` +
      `Address: <code>${account.address}</code>`
    );

    return response;

  } catch (error) {
    console.error('Wallet Generation Error:', error);
    return NextResponse.json({ error: 'Failed to generate wallet' }, { status: 500 });
  }
}

// DELETE - Disconnect wallet
export async function DELETE(request: NextRequest) {
  try {
    const telegramUserId = getTelegramUserId(request);
    const sessionCookieName = getSessionCookieName(telegramUserId);

    // PERSISTENCE: Clear session from database
    if (telegramUserId) {
      const { updateUser, findUserByTelegramId } = await import('@/lib/db/turso');
      const user = await findUserByTelegramId(telegramUserId);
      if (user) {
        await updateUser(telegramUserId, {
          encrypted_session: null
        });
      }
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete(sessionCookieName);

    // Also try to delete the generic session cookie if it exists
    if (telegramUserId) {
      response.cookies.delete('clanker_session');
    }

    return response;
  } catch (error) {
    console.error('Wallet DELETE error:', error);
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }
}
