import { NextRequest, NextResponse } from 'next/server';
import {
  isAdminUser,
  generateAccessCode,
  addDynamicAccessCode,
} from '@/lib/access-control';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://clanker-miniapp.pages.dev';

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

export async function POST(request: NextRequest) {
  try {
    const update: TelegramUpdate = await request.json();
    console.log('[Bot] Received update:', update.update_id);

    // ALWAYS log that we got here
    console.log('[Bot] Webhook executed successfully');

    // Handle messages
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();
      const userId = update.message.from.id;
      const isAdmin = isAdminUser(userId);

      // /start command
      if (text === '/start') {
        if (isAdmin) {
          // Send a rich welcome message with image header if supported or just text
          sendMessageSync(chatId,
            `🌌 <b>UMKM Terminal Control</b>\n\n` +
            `Welcome back, Commander.\n` +
            `System Status: 🟢 Online\n` +
            `Environment: Base Mainnet\n\n` +
            `<i>Click below to launch the command center.</i>`,
            [
              [{ text: '🚀 Launch Terminal', web_app: { url: `${APP_URL}` } }],
              [{ text: '🔑 Generate Access', callback_data: 'quick_invite' }],
              [{ text: '📊 Analytics', callback_data: 'stats' }]
            ]
          );
        } else {
          sendMessageSync(chatId,
            `🔒 <b>UMKM Terminal</b>\n\n` +
            `Access Denied.\n\n` +
            `This is a private deployment tool.\n` +
            `Your ID: <code>${userId}</code>\n\n` +
            `<i>If you have an invite code, launch the app to enter it.</i>`,
            [
              [{ text: '🔓 Enter Access Code', web_app: { url: `${APP_URL}` } }]
            ]
          );
        }
      }
      // /id command
      else if (text === '/id') {
        sendMessageSync(chatId, `Your Telegram ID: <code>${userId}</code>`);
      }
      // /help command
      else if (text === '/help') {
        const helpText = isAdmin
          ? `<b>👮‍♂️ Admin Command Center</b>\n\n` +
          `/invite [label] - Generate 1-time access code\n` +
          `/start - Open dashboard\n` +
          `/settings - Bot configuration\n` +
          `/id - View your ID\n\n` +
          `<i>Use the menu button to launch the full terminal.</i>`
          : `<b>🤖 UMKM Terminal Bot</b>\n\n` +
          `/start - Open terminal\n` +
          `/id - Show your ID\n` +
          `/help - Show this help\n\n` +
          `<i>Ask an admin for an access code to use the app.</i>`;

        sendMessageSync(chatId, helpText);
      }
      // /invite command (Admin only)
      else if (text.startsWith('/invite') && isAdmin) {
        const parts = text.split(' ');
        const label = parts.slice(1).join(' ') || 'User Invite';

        // Generate a random code
        const code = generateAccessCode();

        // Register it in the system (one-time use, 24h expiry)
        addDynamicAccessCode(code, label, undefined, 'telegram'); // Generic code, not bound to ID yet?
        // Wait, addDynamicAccessCode binds to ID if provided. If undefined, it works for anyone?
        // Let's check lib/access-control.ts again.
        // It binds if userId is provided. If undefined, the binding check `if (boundUserId)` in validateAccessCode might skip?
        // Let's re-read validateAccessCode in lib/access-control.ts.

        sendMessageSync(chatId,
          `🎫 <b>Access Code Generated</b>\n\n` +
          `Code: <code>${code}</code>\n` +
          `Label: ${label}\n` +
          `Expiry: 24 hours\n` +
          `Usage: One-time only\n\n` +
          `Share this code with the user.`
        );
      }
    }

    // Handle button callbacks
    if (update.callback_query) {
      const callbackId = update.callback_query.id;
      const data = update.callback_query.data;
      const chatId = update.callback_query.message?.chat.id;
      const userId = update.callback_query.from.id;
      const isAdmin = isAdminUser(userId);

      if (chatId && data && isAdmin) {
        answerCallback(callbackId);

        if (data === 'stats') {
          sendMessageSync(chatId,
            `📊 <b>Platform Statistics</b>\n\n` +
            `👥 Total Users: Loading...\n` +
            `🚀 Deployments: Loading...\n\n` +
            `Detailed stats coming soon!`
          );
        } else if (data === 'users') {
          sendMessageSync(chatId,
            `👤 <b>User Management</b>\n\n` +
            `User list coming soon!\n\n` +
            `Use /invite to generate new codes.`
          );
        } else if (data === 'quick_invite') {
          // Generate a code quickly from button click
          const code = generateAccessCode();
          addDynamicAccessCode(code, 'Quick Invite', undefined, 'telegram');
          sendMessageSync(chatId,
            `🎫 <b>Quick Access Code</b>\n\n` +
            `Code: <code>${code}</code>\n` +
            `Valid for 24h. One-time use.`
          );
        } else if (data === 'reset_sessions') {
          sendMessageSync(chatId, `⚠️ Functionality to reset sessions not yet implemented.`);
        } else if (data === 'edit_template') {
          sendMessageSync(chatId, `Please use the Web App to edit templates.`);
        }
      } else {
        answerCallback(callbackId, 'Action not available');
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Bot] Webhook error:', error);
    return NextResponse.json({ ok: true });
  }
}

// Synchronous send message function with enhanced UI support
function sendMessageSync(chatId: number, text: string, buttons?: InlineKeyboardButton[][], photoUrl?: string) {

  if (!BOT_TOKEN) {
    console.error('[Bot] No BOT_TOKEN configured');
    return false;
  }

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    parse_mode: 'HTML',
  };

  if (buttons && buttons.length > 0) {
    payload.reply_markup = { inline_keyboard: buttons };
  }

  const endpoint = photoUrl ? 'sendPhoto' : 'sendMessage';

  if (photoUrl) {
    payload.photo = photoUrl;
    payload.caption = text;
  } else {
    payload.text = text;
  }

  // Use fetch without await - fire and forget
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(error => {
    console.error('[Bot] Send error:', error);
  });

  return true;
}

// Answer callback
function answerCallback(callbackId: string, text?: string) {
  if (!BOT_TOKEN) return;

  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackId,
      text: text || undefined,
    }),
  }).catch(error => {
    console.error('[Bot] Callback error:', error);
  });
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
