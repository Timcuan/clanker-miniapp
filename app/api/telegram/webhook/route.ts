import { NextRequest, NextResponse } from 'next/server';
import {
  isAdminUser,
  grantAccess,
  revokeAccess,
  verifyAccess,
  PRIMARY_ADMIN_ID,
  sendAdminLog
} from '@/lib/access-control';
import { authorizeUser, isUserAuthorized, initDatabase, findUserByTelegramId } from '@/lib/db/turso';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://clanker-terminal.netlify.app';

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

interface InlineKeyboardButton {
  text: string;
  web_app?: { url: string };
  callback_data?: string;
}

// Simple in-memory rate limiting to prevent spam
const rateLimit = new Map<number, number>();
const RATE_LIMIT_MS = 1000; // 1 message per second

export async function POST(request: NextRequest) {
  try {
    // 1. FAST FAIL & DB READY
    if (!BOT_TOKEN) return NextResponse.json({ ok: true });

    // Resilience: Attempt DB init but don't hard crash if it fails
    // This allows the bot to at least respond with an "Under Maintenance" message
    let dbReady = true;
    try {
      await initDatabase();
    } catch (e) {
      console.error('[Bot] DB Init failed:', e);
      dbReady = false;
    }

    const update: TelegramUpdate = await request.json();
    if (!update.message && !update.callback_query) return NextResponse.json({ ok: true });

    const userId = update.message?.from.id || update.callback_query?.from.id || 0;
    const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id || 0;

    // 2. RATE LIMITING
    const now = Date.now();
    const lastSeen = rateLimit.get(userId) || 0;
    if (now - lastSeen < RATE_LIMIT_MS) {
      return NextResponse.json({ ok: true });
    }
    rateLimit.set(userId, now);

    // 3. LOGIC HANDLERS
    if (update.message?.text) {
      const text = update.message.text.trim();
      const isAdmin = isAdminUser(userId);

      // FALLBACK: If DB is down, only allow Admin or basic ID check
      if (!dbReady) {
        if (isAdmin) {
          await sendMessage(chatId, "⚠️ <b>Warning</b>: Database connection unstable. Basic admin functions still active.");
        } else {
          await sendMessage(chatId, "🛠 <b>Maintenance</b>: Systems are currently being updated. Please try again in a few minutes.");
          return NextResponse.json({ ok: true });
        }
      }

      const { hasAccess } = await verifyAccess(userId);

      // --- COMMANDS ---

      // /start
      if (text === '/start') {
        if (isAdmin) {
          await sendMessage(chatId,
            `🚀 <b>UMKM Terminal v2.0</b>\n\nWelcome back, Admin! Use the buttons below to manage deployments or open the terminal directly.`,
            [
              [{ text: '🖥️ OPEN TERMINAL', web_app: { url: APP_URL } }],
              [
                { text: '➕ DEPLOY', web_app: { url: `${APP_URL}/deploy` } },
                { text: '📜 HISTORY', web_app: { url: `${APP_URL}/history` } }
              ],
              [{ text: '⚙️ SETTINGS', web_app: { url: `${APP_URL}/settings` } }],
              [{ text: '📊 STATS', callback_data: 'stats' }, { text: '👥 USERS', callback_data: 'users' }]
            ]
          );
        } else if (hasAccess) {
          await sendMessage(chatId,
            `🚀 <b>UMKM Terminal</b>\n\nAuth: <b>Verified</b>\n\nYour deployment terminal is ready. Click below to begin:`,
            [
              [{ text: '🖥️ OPEN TERMINAL', web_app: { url: APP_URL } }]
            ]
          );
        } else {
          await sendMessage(chatId,
            `🛡️ <b>Access Restricted</b>\n\nYour user ID <code>${userId}</code> is not authorized.\n\nContact the administrator to request access.`,
            [[{ text: '🆔 My ID', callback_data: 'view_id' }]]
          );

          // Fallback: Notify admin of new potential user
          sendAdminLog(`<b>User Requested Access</b>\nID: <code>${userId}</code>\nUser: @${update.message.from.username || update.message.from.first_name}`);
        }
      }

      // /id
      else if (text === '/id') {
        await sendMessage(chatId, `System ID: <code>${userId}</code>`);
      }

      // /grant [id] (Admin)
      else if (text.startsWith('/grant') && isAdmin) {
        const targetId = parseInt(text.split(' ')[1]);
        if (isNaN(targetId)) {
          await sendMessage(chatId, "Format: <code>/grant [user_id]</code>");
          return NextResponse.json({ ok: true });
        }

        try {
          await grantAccess(targetId);
          await sendMessage(chatId, `✅ <b>Authorized</b>: <code>${targetId}</code>`);

          // Notify target user
          await sendMessage(targetId, `✨ <b>Auth Update</b>\n\nYou have been authorized for Terminal access. Use /start to begin.`);

          // Admin log
          sendAdminLog(`<b>Admin Action</b>: Access GRANTED to <code>${targetId}</code> by <code>${userId}</code>`);
        } catch (err) {
          await sendMessage(chatId, "❌ <b>Error</b>: Failed to authorize user.");
        }
      }

      // /revoke [id] (Admin)
      else if (text.startsWith('/revoke') && isAdmin) {
        const targetId = parseInt(text.split(' ')[1]);
        if (isNaN(targetId)) {
          await sendMessage(chatId, "Format: <code>/revoke [user_id]</code>");
          return NextResponse.json({ ok: true });
        }

        try {
          await revokeAccess(targetId);
          await sendMessage(chatId, `🚫 <b>Revoked</b>: <code>${targetId}</code>`);
          sendAdminLog(`<b>Admin Action</b>: Access REVOKED from <code>${targetId}</code> by <code>${userId}</code>`);
        } catch (err) {
          await sendMessage(chatId, "❌ <b>Error</b>: Failed to revoke access.");
        }
      }

      // /deploy
      else if (text === '/deploy') {
        await sendMessage(chatId, `📦 <b>New Deployment</b>\nClick below to start a new token deployment:`, [
          [{ text: '🚀 Open Deploy Screen', web_app: { url: `${APP_URL}/deploy` } }]
        ]);
      }

      // /history
      else if (text === '/history') {
        await sendMessage(chatId, `📜 <b>Token History</b>\nView your previous deployments and status:`, [
          [{ text: '📂 View History', web_app: { url: `${APP_URL}/history` } }]
        ]);
      }

      // /settings
      else if (text === '/settings') {
        await sendMessage(chatId, `⚙️ <b>Application Settings</b>\nManage your wallets and preferences:`, [
          [{ text: '🛠️ Open Settings', web_app: { url: `${APP_URL}/settings` } }]
        ]);
      }

      // /help
      else if (text === '/help') {
        const msg = isAdmin
          ? `🛠 <b>Admin Control Center</b>\n\n` +
          `🚀 /start - Open Admin Dashboard\n` +
          `➕ /deploy - Launch New Token\n` +
          `📜 /history - View All Deployments\n` +
          `⚙️ /settings - Manage Wallet & UI\n` +
          `🆔 /id - Show your Telegram ID\n` +
          `🔓 /grant [id] - Authorize User\n` +
          `🔒 /revoke [id] - Remove User`
          : `📖 <b>User Guide</b>\n\n` +
          `🚀 /start - Open App Terminal\n` +
          `🆔 /id - Show your Telegram ID\n` +
          `❓ /help - View this message`;
        await sendMessage(chatId, msg);
      }
    }

    // --- CALLBACKS ---
    if (update.callback_query) {
      const { id, data, from } = update.callback_query;
      if (data === 'view_id') {
        await answerCallback(id);
        await sendMessage(chatId, `Your System ID: <code>${from.id}</code>`);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Bot Webhook Error]:', error);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}

async function sendMessage(chatId: number, text: string, buttons?: InlineKeyboardButton[][]) {
  try {
    const payload: any = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };
    if (buttons) payload.reply_markup = { inline_keyboard: buttons };

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function answerCallback(id: string, text?: string) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: id, text }),
    });
  } catch (e) { }
}
