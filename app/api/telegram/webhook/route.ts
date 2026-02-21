import { NextRequest, NextResponse } from 'next/server';
import {
  isAdminUser,
  grantAccess,
  revokeAccess,
  verifyAccess,
  sendAdminLog
} from '@/lib/access-control';
import { initDatabase, findUserByTelegramId, createUser, updateUser, getUserStats } from '@/lib/db/turso';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://clanker-terminal.netlify.app';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const APP_VERSION = '2.2.0';

// ── In-memory access cache — avoids Turso round-trip on repeat messages ───────
const accessCache = new Map<number, { hasAccess: boolean; isAdmin: boolean; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getCachedAccess(userId: number): Promise<{ hasAccess: boolean; isAdmin: boolean }> {
  const cached = accessCache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { hasAccess: cached.hasAccess, isAdmin: cached.isAdmin };
  }
  const isAdmin = isAdminUser(userId);
  const { hasAccess } = isAdmin ? { hasAccess: true } : await verifyAccess(userId);
  const result = { hasAccess: hasAccess || isAdmin, isAdmin };
  accessCache.set(userId, { ...result, ts: Date.now() });
  return result;
}

// ─── Types ─────────────────────────────────────────────────────────────────────
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name: string; username?: string };
    message?: { chat: { id: number } };
    data?: string;
  };
}

// Bot API 9.4: style field for colored buttons
type ButtonStyle = 'default' | 'primary' | 'secondary' | 'danger' | 'success';

interface InlineButton {
  text: string;
  web_app?: { url: string };
  callback_data?: string;
  url?: string;
  style?: ButtonStyle;
}

// Rate limiter
const rateLimit = new Map<number, number>();
const RATE_LIMIT_MS = 800;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function validateRequest(req: NextRequest): boolean {
  if (!WEBHOOK_SECRET) return true;
  return req.headers.get('x-telegram-bot-api-secret-token') === WEBHOOK_SECRET;
}

async function callTelegram(method: string, body: object): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[Bot] ${method} failed ${res.status}: ${err}`);
    }
    return res.ok;
  } catch (e) {
    console.error(`[Bot] ${method} exception:`, e);
    return false;
  }
}

async function sendMessage(chatId: number, text: string, options: object = {}): Promise<boolean> {
  return callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...options });
}

async function answerCallback(id: string, text?: string, show_alert = false): Promise<boolean> {
  return callTelegram('answerCallbackQuery', { callback_query_id: id, text, show_alert });
}

function btn(rows: InlineButton[][]): object {
  return { inline_keyboard: rows };
}

function formatUser(from: { id?: number; first_name: string; username?: string }): string {
  return from.username ? `@${from.username}` : from.first_name;
}

// ─── Process Update ────────────────────────────────────────────────────────────
async function processUpdate(update: TelegramUpdate): Promise<void> {
  const from = update.message?.from || update.callback_query?.from;
  if (!from) return;

  const userId = from.id;
  const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id || 0;
  if (!chatId) return;

  // Rate limit
  const now = Date.now();
  if (now - (rateLimit.get(userId) || 0) < RATE_LIMIT_MS) return;
  rateLimit.set(userId, now);

  // ── Message handling ──────────────────────────────────────────────────────
  if (update.message?.text) {
    const text = update.message.text.trim();

    if (text === '/start') {
      // Parallel: check access + sync DB user simultaneously
      const [access] = await Promise.all([
        getCachedAccess(userId),
        // DB sync non-blocking — don't affect response time
        (async () => {
          try {
            await initDatabase();
            const existing = await findUserByTelegramId(userId);
            if (!existing) {
              await createUser(userId, from.username, from.first_name);
              sendAdminLog(
                `🆕 <b>New User</b>\n` +
                `<b>Name:</b> ${from.first_name}${from.username ? ` (@${from.username})` : ''}\n` +
                `<b>ID:</b> <code>${userId}</code>`
              );
            } else {
              updateUser(userId, { last_active_at: new Date().toISOString(), username: from.username });
            }
          } catch (e) {
            console.error('[Bot] User sync error:', e);
          }
        })(),
      ]);

      const { hasAccess, isAdmin } = access;
      const statusIcon = isAdmin ? '🛡️' : (hasAccess ? '✅' : '🔒');
      const statusLabel = isAdmin ? 'Admin' : (hasAccess ? 'Authorized' : 'Restricted');

      if (!hasAccess && !isAdmin) {
        await sendMessage(chatId,
          `👋 <b>Welcome, ${from.first_name}!</b>\n\n` +
          `${statusIcon} Status: <b>${statusLabel}</b>\n\n` +
          `You need admin authorization to use this terminal.\n` +
          `Tap the button below to get your User ID.`,
          {
            reply_markup: btn([
              [{ text: '🆔 Get My User ID', callback_data: `show_id_${userId}`, style: 'primary' as ButtonStyle }],
              [{ text: '🔄 Check Access Status', callback_data: 'check_access', style: 'secondary' as ButtonStyle }],
            ])
          }
        );
        sendAdminLog(`👤 <b>Unauthorized Attempt</b>\n<b>User:</b> ${formatUser(from)} (<code>${userId}</code>)`);
        return;
      }

      const adminButtons: InlineButton[][] = isAdmin
        ? [[
          { text: '📊 System Stats', callback_data: 'admin_stats', style: 'secondary' as ButtonStyle },
          { text: '📦 Version', callback_data: 'admin_version', style: 'default' as ButtonStyle },
        ]]
        : [];

      await sendMessage(chatId,
        `🚀 <b>UMKM Terminal v${APP_VERSION}</b>\n\n` +
        `${statusIcon} <b>Status:</b> ${statusLabel}  |  👤 ${from.first_name}\n\n` +
        `<i>Tap below to open the terminal and deploy tokens on Base.</i>`,
        {
          reply_markup: btn([
            [{ text: '🖥 Open Terminal', web_app: { url: APP_URL }, style: 'success' as ButtonStyle }],
            ...adminButtons,
          ])
        }
      );
      return;
    }

    // Other commands — get access from cache (fast, no DB hit if cached)
    const { hasAccess, isAdmin } = await getCachedAccess(userId);

    if (text === '/id' || text === 'ID') {
      await sendMessage(chatId,
        `🆔 <b>Your Telegram ID</b>\n\n<code>${userId}</code>\n\n` +
        `Status: ${isAdmin ? '🛡️ Admin' : (hasAccess ? '✅ Authorized' : '🔒 Restricted')}`
      );

    } else if (text === '/help' || text === 'Help') {
      const helpText = isAdmin
        ? `🛡️ <b>Admin Commands</b>\n\n/start — Main menu\n/stats — System stats\n/grant [id] — Authorize user\n/revoke [id] — Revoke access\n/version — App version`
        : `📚 <b>Help</b>\n\nPrivate token deployment terminal on Base.\n\n<b>To get access:</b>\n1. /id → get your Telegram User ID\n2. Share with admin\n3. /start when approved`;
      await sendMessage(chatId, helpText);

    } else if (text === '/stats' && isAdmin) {
      try {
        await initDatabase();
        const stats = await getUserStats();
        await sendMessage(chatId,
          `📊 <b>System Stats — v${APP_VERSION}</b>\n\n` +
          `👥 Total Users: <b>${stats.totalUsers}</b>\n` +
          `✅ Authorized: <b>${stats.usersWithAccess}</b>\n` +
          `🚀 Deployments: <b>${stats.totalDeployments}</b>`
        );
      } catch {
        await sendMessage(chatId, '❌ Error fetching stats.');
      }

    } else if (text === '/version' && isAdmin) {
      await sendMessage(chatId,
        `📦 <b>UMKM Terminal v${APP_VERSION}</b>\n` +
        `Engine: Bankr AI Agent + x402 Protocol\n` +
        `Network: Base Mainnet\n` +
        `Bot API: 9.4`
      );

    } else if (text.startsWith('/grant ') && isAdmin) {
      const targetId = parseInt(text.split(' ')[1]);
      if (!isNaN(targetId)) {
        await grantAccess(targetId);
        accessCache.delete(targetId);
        await Promise.all([
          sendMessage(chatId, `✅ Access granted to <code>${targetId}</code>`),
          sendMessage(targetId, `🎉 <b>Access Granted!</b>\n\nType /start to open the terminal.`),
        ]);
        sendAdminLog(
          `✅ <b>Access Granted</b>\n` +
          `<b>By:</b> ${formatUser(from)} (<code>${userId}</code>)\n` +
          `<b>To:</b> <code>${targetId}</code>`
        );
      } else {
        await sendMessage(chatId, 'Usage: /grant [user_id]');
      }

    } else if (text.startsWith('/revoke ') && isAdmin) {
      const targetId = parseInt(text.split(' ')[1]);
      if (!isNaN(targetId)) {
        await revokeAccess(targetId);
        accessCache.delete(targetId);
        await sendMessage(chatId, `🚫 Access revoked from <code>${targetId}</code>`);
        sendAdminLog(
          `🚫 <b>Access Revoked</b>\n` +
          `<b>By:</b> ${formatUser(from)} (<code>${userId}</code>)\n` +
          `<b>From:</b> <code>${targetId}</code>`
        );
      } else {
        await sendMessage(chatId, 'Usage: /revoke [user_id]');
      }

    } else if (chatId === userId) {
      // Unknown command in private chat — guide them
      await sendMessage(chatId, 'Use /start to open the terminal.',
        { reply_markup: btn([[{ text: '🖥 Open Terminal', web_app: { url: APP_URL }, style: 'success' as ButtonStyle }]]) }
      );
    }
  }

  // ── Callback handling ─────────────────────────────────────────────────────
  if (update.callback_query) {
    const { id, data, from: cbFrom } = update.callback_query;

    if (data?.startsWith('show_id_')) {
      const targetId = data.replace('show_id_', '');
      await answerCallback(id);
      await sendMessage(cbFrom.id,
        `🆔 <b>Your User ID</b>\n\n<code>${targetId}</code>\n\n` +
        `<i>Copy and send to the admin to request access.</i>`
      );

    } else if (data === 'check_access') {
      const { hasAccess } = await getCachedAccess(cbFrom.id);
      await answerCallback(id,
        hasAccess ? '✅ Access confirmed! Type /start.' : '🔒 Not authorized yet. Contact admin.',
        true
      );

    } else if (data === 'admin_stats') {
      try {
        await initDatabase();
        const stats = await getUserStats();
        await answerCallback(id,
          `👥 ${stats.totalUsers} users | ✅ ${stats.usersWithAccess} auth | 🚀 ${stats.totalDeployments} deploys`,
          true
        );
      } catch {
        await answerCallback(id, 'Stats unavailable.', true);
      }

    } else if (data === 'admin_version') {
      await answerCallback(id, `UMKM Terminal v${APP_VERSION} — Bot API 9.4`, true);
    }
  }
}

// ─── Route Handler ─────────────────────────────────────────────────────────────
// CRITICAL: Must respond to Telegram within 10 seconds.
// Strategy: run processUpdate() with await inside a race against 9s timeout.
// This ensures we always return 200 within Telegram's window, while processing fully.
export async function POST(request: NextRequest) {
  if (!BOT_TOKEN) return NextResponse.json({ ok: true });
  if (!validateRequest(request)) return NextResponse.json({ ok: true });

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (!update.message && !update.callback_query) {
    return NextResponse.json({ ok: true });
  }

  // Race: process update vs 9s timeout — Telegram requires response within 10s.
  // If processUpdate finishes in time (cache hit = <2s, cold start = ~3-4s), all good.
  // If it times out, Telegram gets 200 and will retry — next time it'll be warm & fast.
  try {
    await Promise.race([
      processUpdate(update),
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), 9000)),
    ]);
  } catch (e: any) {
    if (e?.message === 'timeout') {
      console.warn('[Bot] processUpdate timed out — Telegram got 200, will retry');
    } else {
      console.error('[Bot] processUpdate error:', e);
    }
  }

  return NextResponse.json({ ok: true });
}
