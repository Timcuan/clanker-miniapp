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

// ─── Types ────────────────────────────────────────────────────────────────────
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name: string; username?: string };
    message?: { chat: { id: number } };
    data?: string;
  };
}

// In-memory rate limiting
const rateLimit = new Map<number, number>();
const RATE_LIMIT_MS = 800;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function validateRequest(req: NextRequest): boolean {
  if (!WEBHOOK_SECRET) return true;
  return req.headers.get('x-telegram-bot-api-secret-token') === WEBHOOK_SECRET;
}

async function callTelegram(method: string, body: any) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (e) {
    console.error(`[Bot] ${method} failed:`, e);
    return false;
  }
}

async function sendMessage(chatId: number, text: string, options: any = {}) {
  return callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...options });
}

async function answerCallback(id: string, text?: string, show_alert = false) {
  return callTelegram('answerCallbackQuery', { callback_query_id: id, text, show_alert });
}

async function sendTyping(chatId: number) {
  return callTelegram('sendChatAction', { chat_id: chatId, action: 'typing' });
}

function formatUser(from: { id?: number; first_name: string; username?: string }) {
  return from.username ? `@${from.username}` : from.first_name;
}

// ─── Command Handlers ─────────────────────────────────────────────────────────

async function handleStart(userId: number, chatId: number, isAdmin: boolean, hasAccess: boolean, from: { first_name: string; username?: string }) {
  // Remove any custom keyboard
  await sendMessage(chatId, '·', { reply_markup: { remove_keyboard: true } });

  const statusIcon = isAdmin ? '🛡️' : (hasAccess ? '✅' : '🔒');
  const statusLabel = isAdmin ? 'Admin' : (hasAccess ? 'Authorized' : 'Restricted');

  if (!hasAccess && !isAdmin) {
    // Unauthorized user flow
    await sendMessage(chatId,
      `👋 <b>Welcome, ${from.first_name}!</b>\n\n` +
      `${statusIcon} <b>Status:</b> ${statusLabel}\n\n` +
      `You need authorization to use this terminal.\n` +
      `Share your User ID with the admin to request access.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🆔 My User ID', callback_data: `show_id_${userId}` }],
            [{ text: '🔄 Check Access', callback_data: 'check_access' }],
          ]
        }
      }
    );

    // Log unauthorized access attempt to admin
    sendAdminLog(
      `👤 <b>Unauthorized Access Attempt</b>\n` +
      `<b>User:</b> ${formatUser(from)} (<code>${userId}</code>)`
    );
    return;
  }

  // Authorized flow — clean single launch button
  await sendMessage(chatId,
    `🚀 <b>UMKM Terminal v${APP_VERSION}</b>\n\n` +
    `${statusIcon} <b>Status:</b> ${statusLabel}\n` +
    `👤 <b>User:</b> ${from.first_name}\n\n` +
    `<i>Tap the button to open the terminal.</i>`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🖥 Open Terminal', web_app: { url: APP_URL } }],
          ...(isAdmin ? [[{ text: '📊 Stats', callback_data: 'admin_stats' }]] : []),
        ]
      }
    }
  );
}

// ─── Main Route ───────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    if (!BOT_TOKEN) return NextResponse.json({ ok: true });

    if (!validateRequest(request)) {
      console.warn('[Bot] Invalid webhook secret');
      return NextResponse.json({ ok: true });
    }

    const update: TelegramUpdate = await request.json();
    if (!update.message && !update.callback_query) return NextResponse.json({ ok: true });

    // DB init (non-fatal)
    let dbReady = true;
    try {
      await initDatabase();
    } catch (e) {
      console.error('[Bot] DB init warning:', e);
      dbReady = false;
    }

    const from = update.message?.from || update.callback_query?.from;
    if (!from) return NextResponse.json({ ok: true });

    const userId = from.id;
    const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id || 0;

    // Rate limit
    const now = Date.now();
    if (now - (rateLimit.get(userId) || 0) < RATE_LIMIT_MS) return NextResponse.json({ ok: true });
    rateLimit.set(userId, now);

    // User sync (async non-blocking)
    if (dbReady && userId > 0) {
      findUserByTelegramId(userId).then(async (existing) => {
        if (!existing) {
          await createUser(userId, from.username, from.first_name);
          console.log(`[Bot] New user: ${userId} (@${from.username})`);
          // Log new user registration
          sendAdminLog(
            `🆕 <b>New User Registered</b>\n` +
            `<b>Name:</b> ${from.first_name}${from.username ? ` (@${from.username})` : ''}\n` +
            `<b>ID:</b> <code>${userId}</code>`
          );
        } else {
          await updateUser(userId, {
            last_active_at: new Date().toISOString(),
            username: from.username || undefined,
          });
        }
      }).catch(e => console.error('[Bot] User sync error:', e));
    }

    // ── Message handling ──────────────────────────────────────────────────────
    if (update.message?.text) {
      const text = update.message.text.trim();
      const isAdmin = isAdminUser(userId);
      const { hasAccess } = await verifyAccess(userId);

      if (!dbReady && !isAdmin) {
        await sendMessage(chatId, '⚙️ System maintenance. Try again in a minute.');
        return NextResponse.json({ ok: true });
      }

      await sendTyping(chatId);

      if (text === '/start') {
        await handleStart(userId, chatId, isAdmin, hasAccess, from);

      } else if (text === '/id' || text === 'ID') {
        await sendMessage(chatId,
          `🆔 <b>Your Telegram ID</b>\n\n` +
          `<code>${userId}</code>\n\n` +
          `<b>Status:</b> ${isAdmin ? '🛡️ Admin' : (hasAccess ? '✅ Authorized' : '🔒 Restricted')}`
        );

      } else if (text === '/help' || text === 'Help') {
        const helpText = isAdmin
          ? `🛡️ <b>Admin Commands</b>\n\n` +
          `/start — Main menu\n` +
          `/stats — System stats\n` +
          `/grant [id] — Authorize user\n` +
          `/revoke [id] — Revoke access\n` +
          `/version — App version info`
          : `📚 <b>Help</b>\n\n` +
          `This is a private token deployment terminal.\n\n` +
          `<b>To get access:</b>\n` +
          `1. Use /id to get your Telegram User ID\n` +
          `2. Send your ID to the admin\n` +
          `3. Type /start once approved`;
        await sendMessage(chatId, helpText);

      } else if ((text === '/stats' || text === 'Status') && isAdmin) {
        try {
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
          `📦 <b>UMKM Terminal</b>\n` +
          `Version: <code>v${APP_VERSION}</code>\n` +
          `Engine: Bankr AI Agent + x402\n` +
          `Network: Base Mainnet`
        );

      } else if (text.startsWith('/grant ') && isAdmin) {
        const targetId = parseInt(text.split(' ')[1]);
        if (!isNaN(targetId)) {
          await grantAccess(targetId);
          await sendMessage(chatId, `✅ Access granted to <code>${targetId}</code>`);
          // Notify the user
          await sendMessage(targetId,
            `🎉 <b>Access Granted!</b>\n\nYou can now use the UMKM Terminal.\nType /start to open the launch menu.`
          );
          // Admin log
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
        // Unknown command in private chat only — guide them
        await sendMessage(chatId,
          `Use /start to open the terminal menu, or /help for commands.`,
          { reply_markup: { inline_keyboard: [[{ text: '🖥 Open Terminal', web_app: { url: APP_URL } }]] } }
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
          `🆔 <b>Your User ID</b>\n\n<code>${targetId}</code>\n\n<i>Copy and share this with the admin to request access.</i>`
        );

      } else if (data === 'check_access') {
        const { hasAccess } = await verifyAccess(cbFrom.id);
        await answerCallback(id,
          hasAccess ? '✅ Access confirmed! Type /start to begin.' : '🔒 No access yet. Contact the admin.',
          true
        );

      } else if (data === 'admin_stats') {
        try {
          const stats = await getUserStats();
          await answerCallback(id,
            `Users: ${stats.totalUsers} | Auth: ${stats.usersWithAccess} | Deploys: ${stats.totalDeployments}`,
            true
          );
        } catch {
          await answerCallback(id, 'Stats unavailable.', true);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Bot] Fatal error:', error);
    return NextResponse.json({ ok: true }); // Always 200 to prevent Telegram retries
  }
}
