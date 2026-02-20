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
          } else {
            await sendMessage(chatId,
              `🛡️ <b>UMKM Terminal - Access Restricted</b>\n\nYour user ID <code>${userId}</code> is not authorized for deployment.\n\nContact the administrator to gain access to the private Clanker terminal.`
            );
          }
        } else if (text === '/deploy') {
          await sendMessage(chatId, `📦 <b>New Deployment</b>\nClick below to start a new token deployment:`, [
            [{ text: '🚀 Open Deploy Screen', web_app: { url: `${APP_URL}/deploy` } }]
          ]);
        } else if (text === '/history') {
          await sendMessage(chatId, `📜 <b>Token History</b>\nView your previous deployments and status:`, [
            [{ text: '📂 View History', web_app: { url: `${APP_URL}/history` } }]
          ]);
        } else if (text === '/settings') {
          await sendMessage(chatId, `⚙️ <b>Application Settings</b>\nManage your wallets and preferences:`, [
            [{ text: '🛠️ Open Settings', web_app: { url: `${APP_URL}/settings` } }]
          ]);
        } else if (text === '/id') {
          await sendMessage(chatId, `Your Telegram ID: <code>${userId}</code>`);
        } else if (text === '/help') {
          const helpText = admin
            ? `🛠 <b>Admin Control Center</b>\n\n` +
            `🚀 /start - Open Admin Dashboard\n` +
            `➕ /deploy - Launch New Token\n` +
            `📜 /history - View All Deployments\n` +
            `⚙️ /settings - Manage Wallet & UI\n` +
            `🆔 /id - Show your Telegram ID`
            : `📖 <b>User Guide</b>\n\n` +
            `🚀 /start - Open App Terminal\n` +
            `🆔 /id - Show your Telegram ID\n` +
            `❓ /help - View this message`;
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
