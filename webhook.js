const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://clanker-miniapp.pages.dev';
const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => parseInt(id.trim()));

function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

async function sendMessage(chatId, text, buttons) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  };

  if (buttons && buttons.length > 0) {
    payload.reply_markup = { inline_keyboard: buttons };
  }

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  console.log('Send result:', result);
  return result.ok;
}

const webhookHandler = {
  async fetch(request) {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const update = await request.json();
      console.log('Received update:', update.update_id);

      if (update.message?.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text.trim();
        const userId = update.message.from.id;
        const admin = isAdmin(userId);

        console.log('Message:', text, 'from:', userId, 'admin:', admin);

        if (text === '/start') {
          if (admin) {
            await sendMessage(chatId, 
              `🔹 <b>UMKM Terminal - Admin Panel</b>\n\nWelcome back, Admin!\n\nChoose an action:`,
              [
                [{ text: '🚀 Open Terminal', web_app: { url: APP_URL } }],
                [{ text: '📊 View Stats', callback_data: 'stats' }, { text: '👤 Manage Users', callback_data: 'users' }],
              ]
            );
          } else {
            await sendMessage(chatId, 
              `🔹 <b>UMKM Terminal</b>\n\nWelcome!\n\nThis is a private token deployment platform.\n\nYour ID: <code>${userId}</code>\n\nContact admin for access.`
            );
          }
        } else if (text === '/id') {
          await sendMessage(chatId, `Your Telegram ID: <code>${userId}</code>`);
        } else if (text === '/help') {
          const helpText = admin
            ? `<b>Admin Commands:</b>\n\n/start - Open admin panel\n/id - Show your ID\n/help - Show this help`
            : `<b>Commands:</b>\n\n/start - Open terminal\n/id - Show your ID\n/help - Show this help`;
          await sendMessage(chatId, helpText);
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
};

export default webhookHandler;
