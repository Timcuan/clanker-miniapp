import { NextRequest, NextResponse } from 'next/server';
import { isAdminUser } from '@/lib/access-control';

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

// Send message function
async function sendMessage(chatId: number, text: string, buttons?: InlineKeyboardButton[][]) {
  if (!BOT_TOKEN) {
    console.error('[Bot] No BOT_TOKEN configured');
    return false;
  }

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  };

  if (buttons && buttons.length > 0) {
    payload.reply_markup = { inline_keyboard: buttons };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!result.ok) {
      console.error('[Bot] Send error:', result);
      return false;
    }
    console.log('[Bot] Message sent successfully');
    return true;
  } catch (error) {
    console.error('[Bot] Send failed:', error);
    return false;
  }
}

// Answer callback
async function answerCallback(callbackId: string, text?: string) {
  if (!BOT_TOKEN) return;
  
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        callback_query_id: callbackId,
        text: text || undefined,
      }),
    });
  } catch (error) {
    console.error('[Bot] Callback error:', error);
  }
}

// Main webhook handler
export async function POST(request: NextRequest) {
  try {
    const update: TelegramUpdate = await request.json();
    console.log('[Bot] Received update:', update.update_id);

    // Handle messages
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();
      const userId = update.message.from.id;
      const isAdmin = isAdminUser(userId);
      
      console.log('[Bot] Message from:', userId, 'isAdmin:', isAdmin, 'text:', text);

      // /start command
      if (text === '/start') {
        if (isAdmin) {
          const sent = await sendMessage(chatId, 
            `🔹 <b>UMKM Terminal - Admin Panel</b>\n\nWelcome back, Admin!\n\nChoose an action:`,
            [
              [{ text: '🚀 Open Terminal', web_app: { url: `${APP_URL}` } }],
              [{ text: '📊 View Stats', callback_data: 'stats' }, { text: '👤 Manage Users', callback_data: 'users' }],
            ]
          );
          if (!sent) {
            // Fallback message
            await sendMessage(chatId, '🚀 <b>Terminal</b>\n\n<a href="https://clanker-miniapp.pages.dev">Open App</a>');
          }
        } else {
          await sendMessage(chatId, 
            `🔹 <b>UMKM Terminal</b>\n\nWelcome!\n\nThis is a private token deployment platform.\n\nYour ID: <code>${userId}</code>\n\nContact admin for access.`
          );
        }
      }
      // /id command
      else if (text === '/id') {
        await sendMessage(chatId, `Your Telegram ID: <code>${userId}</code>`);
      }
      // /help command
      else if (text === '/help') {
        const helpText = isAdmin
          ? `<b>Admin Commands:</b>\n\n/start - Open admin panel\n/id - Show your ID\n/help - Show this help`
          : `<b>Commands:</b>\n\n/start - Open terminal\n/id - Show your ID\n/help - Show this help`;
        await sendMessage(chatId, helpText);
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
        await answerCallback(callbackId);
        
        if (data === 'stats') {
          await sendMessage(chatId, 
            `📊 <b>Platform Statistics</b>\n\n` +
            `👥 Total Users: Loading...\n` +
            `🚀 Deployments: Loading...\n\n` +
            `Detailed stats coming soon!`
          );
        } else if (data === 'users') {
          await sendMessage(chatId, 
            `👤 <b>User Management</b>\n\n` +
            `User list coming soon!\n\n` +
            `Use /grant USER_ID to grant access.`
          );
        }
      } else {
        await answerCallback(callbackId, 'Action not available');
      }
    }

    // Wait for messages to be sent
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Bot] Webhook error:', error);
    return NextResponse.json({ ok: true });
  }
}
