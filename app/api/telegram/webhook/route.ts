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

const rateLimit = new Map<number, number>();
const RATE_LIMIT_MS = 1000;

export async function POST(request: NextRequest) {
  try {
    if (!BOT_TOKEN) return NextResponse.json({ ok: true });

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

    const now = Date.now();
    const lastSeen = rateLimit.get(userId) || 0;
    if (now - lastSeen < RATE_LIMIT_MS) return NextResponse.json({ ok: true });
    rateLimit.set(userId, now);

    // --- MESSAGE HANDLER ---
    if (update.message?.text) {
      const text = update.message.text.trim();
      const isAdmin = isAdminUser(userId);

      if (!dbReady && !isAdmin) {
        await sendMessage(chatId, "🛠 <b>Maintenance</b>: Systems are currently being updated. Please try again soon.");
        return NextResponse.json({ ok: true });
      }

      // Proactive Registration
      if (dbReady) {
        try {
          const existingUser = await findUserByTelegramId(userId);
          if (!existingUser) {
            await createUser(userId, update.message.from.username, update.message.from.first_name);
            console.log(`[Bot] Registered: ${userId}`);
          } else {
            await updateUser(userId, {
              last_active_at: new Date().toISOString(),
              username: update.message.from.username || undefined
            });
          }
        } catch (e) {
          console.error('[Bot] DB logging error:', e);
        }
      }

      const accessCheck = await verifyAccess(userId);
      const hasAccess = accessCheck.hasAccess;

      // Commands
      if (text === '/start') {
        if (isAdmin || hasAccess) {
          const welcomeMsg = isAdmin
            ? `<b>UMKM Terminal v2.0</b>\n\nWelcome back, Admin. Your terminal is ready for production:`
            : `<b>UMKM Terminal v2.0</b>\n\nYour deployment terminal is authorized and ready:`;

          await sendMessage(chatId, welcomeMsg, [[{ text: 'OPEN TERMINAL', web_app: { url: APP_URL } }]]);
        } else {
          await sendMessage(chatId,
            `<b>Access Restricted</b>\n\nYour user ID <code>${userId}</code> is not authorized.\n\n` +
            `<b>How to gain access?</b>\n` +
            `1. Click "Copy My ID" below\n` +
            `2. Send it to @admin\n` +
            `3. Wait for authorization notification`,
            [[{ text: 'Copy My ID', callback_data: `copy_id_${userId}` }]]
          );
          sendAdminLog(`🚨 <b>Access Attempt</b>\nUser: @${update.message.from.username}\nID: <code>${userId}</code>`);
        }
      } else if (text === '/id') {
        await sendMessage(chatId, `System ID: <code>${userId}</code>\nStatus: ${isAdmin ? 'Admin' : (hasAccess ? 'Authorized' : 'Restricted')}`);
      } else if (text === '/stats' && isAdmin) {
        try {
          const stats = await getUserStats();
          await sendMessage(chatId, `📊 <b>Stats</b>\n\nUsers: ${stats.totalUsers}\nAuth: ${stats.usersWithAccess}\nDeploys: ${stats.totalDeployments}\nSuccess: ${stats.successfulDeployments}`);
        } catch (e) {
          await sendMessage(chatId, "❌ Error fetching stats");
        }
      } else if (text.startsWith('/grant') && isAdmin) {
        const targetId = parseInt(text.split(' ')[1]);
        if (!isNaN(targetId)) {
          await grantAccess(targetId);
          await sendMessage(chatId, `✅ Authorized: <code>${targetId}</code>`);
          await sendMessage(targetId, `✨ <b>Authorized!</b>\nYour access to the terminal has been granted. Click /start to begin.`);
          sendAdminLog(`Admin ${userId} granted access to ${targetId}`);
        }
      } else if (text.startsWith('/revoke') && isAdmin) {
        const targetId = parseInt(text.split(' ')[1]);
        if (!isNaN(targetId)) {
          await revokeAccess(targetId);
          await sendMessage(chatId, `🚫 Revoked: <code>${targetId}</code>`);
        }
      } else if (text === '/help') {
        const help = isAdmin
          ? `<b>Admin Commands</b>\n/start - Dashboard\n/stats - Stats\n/grant [id]\n/revoke [id]`
          : `<b>Commands</b>\n/start - Open App\n/id - Show ID`;
        await sendMessage(chatId, help);
      }
    }

    // --- CALLBACK HANDLER ---
    if (update.callback_query) {
      const { id, data, from } = update.callback_query;
      if (dbReady) updateUser(from.id, { last_active_at: new Date().toISOString() }).catch(() => { });

      if (data?.startsWith('copy_id_')) {
        const targetId = data.split('_')[2];
        await answerCallback(id, "ID Ready to copy!");
        await sendMessage(chatId, `Target ID: <code>${targetId}</code>\nTo authorize:\n<code>/grant ${targetId}</code>`);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Bot Fatal]:', error);
    return NextResponse.json({ ok: true });
  }
}

async function sendMessage(chatId: number, text: string, buttons?: InlineKeyboardButton[][]) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup: buttons ? { inline_keyboard: buttons } : undefined }),
    });
    return res.ok;
  } catch (e) { return false; }
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
