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
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET; // Optional: verify secret token

// Types
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
  url?: string;
  callback_data?: string;
  style?: 'default' | 'primary' | 'secondary' | 'danger' | 'success'; // Telegram Bot API 9.4
}

// In-memory rate limiting (simple implementation)
const rateLimit = new Map<number, number>();
const RATE_LIMIT_MS = 800; // Slightly reduced for responsiveness

// Helper: Validation
function validateRequest(req: NextRequest): boolean {
  if (!WEBHOOK_SECRET) return true; // Skip if not configured
  const token = req.headers.get('x-telegram-bot-api-secret-token');
  return token === WEBHOOK_SECRET;
}

// Helper: Telegram API Wrapper
async function callTelegram(method: string, body: any) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch (e) {
    console.error(`[Telegram API] Failed to call ${method}:`, e);
    return false;
  }
}

async function sendMessage(chatId: number, text: string, options: any = {}) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...options
  };
  return callTelegram('sendMessage', body);
}

async function answerCallback(callback_query_id: string, text?: string, show_alert = false) {
  return callTelegram('answerCallbackQuery', { callback_query_id, text, show_alert });
}

async function sendTyping(chatId: number) {
  return callTelegram('sendChatAction', { chat_id: chatId, action: 'typing' });
}

// --- COMMAND HANDLERS ---

async function handleStart(userId: number, chatId: number, isAdmin: boolean, hasAccess: boolean) {
  // 1. Force-Disable any custom Menu Button (the blue Terminal button)
  await callTelegram('setChatMenuButton', { chat_id: chatId, menu_button: { type: 'default' } });

  // 2. Remove Reply Keyboard entirely to satisfy "One Button" requirement
  await sendMessage(chatId, "UMKM Terminal Control Hub.", {
    reply_markup: { remove_keyboard: true }
  });

  // 3. The ONLY Launch Button (Consolidated Inline Button)
  const statusLabel = isAdmin ? 'Admin' : (hasAccess ? 'Authorized' : 'Restricted');
  const welcomeText = `🚀 <b>UMKM Terminal v1.1.2</b>\n\nStatus: <b>${statusLabel}</b>\n\nClick the button below to launch your terminal.`;

  const inlineButtons: InlineKeyboardButton[][] = [
    [{ text: "🖥 Launch Terminal", web_app: { url: APP_URL }, style: 'success' }]
  ];

  if (!hasAccess && !isAdmin) {
    await sendMessage(chatId,
      "⚠️ <b>Authorization Required</b>\n\nYou are not authorized to access this terminal. Please contact an admin with your ID below.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Check Access", callback_data: "check_access", style: 'primary' }],
            [{ text: "🆔 Copy ID", callback_data: `copy_id_${userId}`, style: 'secondary' }]
          ]
        }
      }
    );
  } else {
    await sendMessage(chatId, welcomeText, {
      reply_markup: { inline_keyboard: inlineButtons }
    });
  }
}

// --- MAIN ROUTE ---

export async function POST(request: NextRequest) {
  try {
    if (!BOT_TOKEN) return NextResponse.json({ ok: true });

    // 1. Security Check
    if (!validateRequest(request)) {
      console.warn('[Bot] Invalid secret token');
      return NextResponse.json({ ok: true }); // Silent fail to not leak info
    }

    const update: TelegramUpdate = await request.json();

    // Quick exit for irrelevant updates
    if (!update.message && !update.callback_query) return NextResponse.json({ ok: true });

    // 2. Database Init (Robustness: Don't fail hard if DB is laggy, just degrade)
    let dbReady = true;
    try {
      await initDatabase();
    } catch (e) {
      console.error('[Bot] DB Init Warning:', e);
      dbReady = false;
    }

    // 3. Extract Info
    const userId = update.message?.from.id || update.callback_query?.from.id || 0;
    const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id || 0;

    // 4. Rate Limit
    const now = Date.now();
    const lastSeen = rateLimit.get(userId) || 0;
    if (now - lastSeen < RATE_LIMIT_MS) return NextResponse.json({ ok: true });
    rateLimit.set(userId, now);

    // 5. User Sync (Async - non-blocking)
    if (dbReady && userId > 0) {
      const username = update.message?.from.username || update.callback_query?.from.username;
      const firstName = update.message?.from.first_name || update.callback_query?.from.first_name;

      findUserByTelegramId(userId).then(async (existing) => {
        if (!existing) {
          await createUser(userId, username, firstName);
          console.log(`[Bot] New User Registered: ${userId}`);
          sendAdminLog(`New User: ${username || userId} (${userId})`);
        } else {
          await updateUser(userId, {
            last_active_at: new Date().toISOString(),
            username: username || undefined
          });
        }
      }).catch(e => console.error('[Bot] User Sync Error:', e));
    }

    // --- MESSAGE PROCESSING ---
    if (update.message?.text) {
      const text = update.message.text.trim();
      const isAdmin = isAdminUser(userId);
      const { hasAccess } = await verifyAccess(userId);

      // Maintenance Mode Check (Fail gracefully)
      if (!dbReady && !isAdmin) {
        await sendMessage(chatId, "⚠️ System maintenance. Please try again in 1 minute.");
        return NextResponse.json({ ok: true });
      }

      await sendTyping(chatId); // UX: Show bot is thinking

      // Command Router
      if (text === '/start') {
        await handleStart(userId, chatId, isAdmin, hasAccess);
      } else if (text === 'ID' || text === '🆔 ID' || text === 'My ID' || text === '/id') {
        await sendMessage(chatId, `🆔 <b>User ID:</b> <code>${userId}</code>\n\nStatus: <b>${isAdmin ? 'Admin' : (hasAccess ? 'Authorized' : 'Restricted')}</b>`);
      } else if (text === 'Help' || text === '❓ Help' || text === '/help') {
        const helpText = isAdmin
          ? `<b>Admin Controls:</b>\n/start - Menu\n/stats - System Stats\n/grant [id] - Authorize User\n/revoke [id] - Ban User`
          : `<b>Commands:</b>\n/start - Open Menu\n/id - Show ID\n/help - Show this guide`;
        await sendMessage(chatId, helpText);
      } else if (text === 'Launch Terminal' || text === '🖥 Launch Terminal' || text === '/terminal') {
        // Handle "Launch Terminal" as text (fallback)
        await sendMessage(chatId, "Click below to launch the terminal:", {
          reply_markup: {
            inline_keyboard: [[{ text: "🖥 Launch Terminal", web_app: { url: APP_URL }, style: 'success' }]]
          }
        });
      } else if (text === 'Status' || text === '📊 Status' || text === '/stats') {
        if (isAdmin) {
          try {
            const stats = await getUserStats();
            await sendMessage(chatId, `📊 <b>System Statistics</b>\n\nUsers: ${stats.totalUsers}\nAuthorized: ${stats.usersWithAccess}\nDeployments: ${stats.totalDeployments}`);
          } catch {
            await sendMessage(chatId, "Error fetching stats.");
          }
        } else {
          await sendMessage(chatId, "🟢 <b>Status: Online</b>\nSystem Operational");
        }
      } else if (text.startsWith('/grant ') && isAdmin) {
        const targetId = parseInt(text.split(' ')[1]);
        if (!isNaN(targetId)) {
          await grantAccess(targetId);
          await sendMessage(chatId, `✅ Access granted to <code>${targetId}</code>`);
          await sendMessage(targetId, `🎉 <b>Access Granted!</b>\n\nYou can now use the UMKM Terminal. Type /start to begin.`);
        } else {
          await sendMessage(chatId, "Usage: /grant [user_id]");
        }
      } else if (text.startsWith('/revoke ') && isAdmin) {
        const targetId = parseInt(text.split(' ')[1]);
        if (!isNaN(targetId)) {
          await revokeAccess(targetId);
          await sendMessage(chatId, `🚫 Access revoked from <code>${targetId}</code>`);
        }
      } else {
        // Unknown command
        if (chatId === userId) { // Only in private chats
          // Optional: Echo or ignore
        }
      }
    }

    // --- CALLBACK PROCESSING ---
    if (update.callback_query) {
      const { id, data, from } = update.callback_query;

      if (data?.startsWith('copy_id_')) {
        const targetId = data.split('_')[2];
        await answerCallback(id, "ID Copied to clipboard!"); // Note: Telegram doesn't actually copy to clipboard from alert, but UX implies it if user taps.
        await sendMessage(from.id, `<code>${targetId}</code>`); // Send ID as monospaced for easy copying
      } else if (data === 'check_access') {
        const { hasAccess } = await verifyAccess(from.id);
        const msg = hasAccess ? "✅ Access Granted. You are ready." : "🚫 Authorization Required. Please contact admin.";
        await answerCallback(id, msg, true); // Show alert
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Bot Fatal Error]:', error);
    // Return 200 OK even on error to prevent Telegram from retrying endlessly
    return NextResponse.json({ ok: true });
  }
}
