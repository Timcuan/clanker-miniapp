import { NextRequest, NextResponse } from 'next/server';
import { isAdminUser, grantAccess, revokeAccess, verifyAccess, sendAdminLog } from '@/lib/access-control';
import { initDatabase, findUserByTelegramId, createUser, updateUser, getUserStats } from '@/lib/db/turso';
import { ipfsService } from '@/lib/ipfs/service';

function getEnv(key: string, fallback = '') {
  return process.env[key] || fallback;
}

const APP_URL = getEnv('NEXT_PUBLIC_APP_URL', 'https://clanker-terminal.netlify.app');
const APP_VERSION = '2.3.0';

interface Btn { text: string; web_app?: { url: string }; callback_data?: string; }
interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    photo?: { file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }[];
  };
  callback_query?: { id: string; from: { id: number; first_name: string; username?: string }; message?: { chat: { id: number } }; data?: string };
}

// In-memory access cache — 5 min TTL, skips Turso on repeat
const cache = new Map<number, { ok: boolean; ts: number }>();
const rate = new Map<number, number>();

async function getAccess(uid: number): Promise<boolean> {
  const c = cache.get(uid);
  if (c && Date.now() - c.ts < 300000) return c.ok;
  const { hasAccess } = await verifyAccess(uid);
  cache.set(uid, { ok: hasAccess, ts: Date.now() });
  return hasAccess;
}

let lastError = '';

async function tg(method: string, body: object) {
  try {
    const BOT_TOKEN = getEnv('TELEGRAM_BOT_TOKEN');
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!r.ok) {
      lastError = `[bot] ${method} failed: ${r.status} ` + (await r.text());
      console.error(lastError);
    }
  } catch (e: any) {
    lastError = `Fetch error: ${e.message}`;
    console.error(lastError);
  }
}

const msg = (chatId: number, text: string, opts: object = {}) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...opts });

const cb = (id: string, text: string, alert = false) =>
  tg('answerCallbackQuery', { callback_query_id: id, text, show_alert: alert });

const kb = (rows: Btn[][]) => ({ inline_keyboard: rows });

export async function POST(req: NextRequest) {
  const BOT_TOKEN = getEnv('TELEGRAM_BOT_TOKEN');
  if (!BOT_TOKEN) return NextResponse.json({ ok: true, lastError: 'No BOT_TOKEN resolved' });

  let update: TgUpdate;
  try { update = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  if (!update.message && !update.callback_query) return NextResponse.json({ ok: true });

  const from = update.message?.from ?? update.callback_query?.from;
  if (!from) return NextResponse.json({ ok: true });

  const uid = from.id;
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? 0;

  // Rate limit
  if (Date.now() - (rate.get(uid) ?? 0) < 800) return NextResponse.json({ ok: true, lastError: 'rate limit' });
  rate.set(uid, Date.now());

  // ── Messages ──────────────────────────────────────────────────────────────
  if (update.message?.text) {
    const text = update.message.text.trim();
    const isAdmin = isAdminUser(uid); // synchronous — 0ms
    const hasAccess = isAdmin || await getAccess(uid); // cache hit = 0ms, miss = ~1s Turso

    if (text === '/start') {
      if (!hasAccess) {
        // Background: register new user (don't await to keep /start fast)
        (async () => {
          try {
            await initDatabase();
            const ex = await findUserByTelegramId(uid);
            if (!ex) {
              await createUser(uid, from.username, from.first_name);
              sendAdminLog(`🆕 <b>New User</b>\n${from.first_name}${from.username ? ` (@${from.username})` : ''} <code>${uid}</code>`);
            }
          } catch { }
        })();

        await msg(chatId,
          `👋 <b>Welcome, ${from.first_name}!</b>\n\n🔒 <b>Status: Restricted</b>\n\nYou need authorization. Share your ID with the admin.`,
          {
            reply_markup: kb([
              [{ text: '🆔 Get My User ID', callback_data: `myid_${uid}` }],
              [{ text: '🔄 Check Access', callback_data: 'check_access' }],
            ])
          }
        );
        sendAdminLog(`👤 <b>Unauthorized:</b> ${from.first_name} (<code>${uid}</code>)`);
      } else {
        const icon = isAdmin ? '🛡️' : '✅';
        const label = isAdmin ? 'Admin' : 'Authorized';
        const adminRows: Btn[][] = isAdmin
          ? [[{ text: '📊 Stats', callback_data: 'stats' },
          { text: '📦 v' + APP_VERSION, callback_data: 'ver' }]]
          : [];
        await msg(chatId,
          `🚀 <b>UMKM Terminal v${APP_VERSION}</b>\n\n${icon} <b>${label}</b> · ${from.first_name}\n\n<i>Open the terminal to deploy tokens on Base.</i>`,
          {
            reply_markup: kb([
              [{ text: '🖥 Open Terminal', web_app: { url: APP_URL } }],
              ...adminRows,
            ])
          }
        );
      }
      return NextResponse.json({ ok: true, lastError });
    }

    if (text === '/id') {
      await msg(chatId, `🆔 <b>Your ID:</b> <code>${uid}</code>\nStatus: ${isAdmin ? '🛡️ Admin' : hasAccess ? '✅ Authorized' : '🔒 Restricted'}`);
    } else if (text === '/help') {
      await msg(chatId, isAdmin
        ? `🛡️ <b>Admin</b>\n/start /id /stats /grant [id] /revoke [id] /version`
        : `📚 <b>Help</b>\nPrivate terminal. Send /id to get your Telegram ID, share with admin.`);
    } else if (text === '/stats' && isAdmin) {
      try {
        await initDatabase();
        const s = await getUserStats();
        await msg(chatId, `📊 Users: ${s.totalUsers} | Auth: ${s.usersWithAccess} | Deploys: ${s.totalDeployments}`);
      } catch { await msg(chatId, '❌ DB error'); }
    } else if (text === '/version' && isAdmin) {
      await msg(chatId, `📦 UMKM Terminal v${APP_VERSION} · Bot API 9.4`);
    } else if (text.startsWith('/grant ') && isAdmin) {
      const tid = parseInt(text.split(' ')[1]);
      if (!isNaN(tid)) {
        await grantAccess(tid); cache.delete(tid);
        await Promise.all([
          msg(chatId, `✅ Granted to <code>${tid}</code>`),
          msg(tid, `🎉 <b>Access Granted!</b> Type /start to begin.`),
        ]);
        sendAdminLog(`✅ Granted ${tid} by ${from.first_name}`);
      }
    } else if (text.startsWith('/revoke ') && isAdmin) {
      const tid = parseInt(text.split(' ')[1]);
      if (!isNaN(tid)) {
        await revokeAccess(tid); cache.delete(tid);
        await msg(chatId, `🚫 Revoked <code>${tid}</code>`);
        sendAdminLog(`🚫 Revoked ${tid} by ${from.first_name}`);
      }
    } else if (chatId === uid) {
      await msg(chatId, 'Type /start', { reply_markup: kb([[{ text: '🖥 Open Terminal', web_app: { url: APP_URL } }]]) });
    }
  }

  // ── Photos / Images ───────────────────────────────────────────────────────
  if (update.message?.photo) {
    const isAdmin = isAdminUser(uid);
    const hasAccess = isAdmin || await getAccess(uid);

    // Check auth
    if (!hasAccess) {
      await msg(chatId, `🚫 You do not have access to use this bot's features.`);
      return NextResponse.json({ ok: true });
    }

    // Acknowledge receipt
    await msg(chatId, '⚙️ <i>Processing image and uploading to decentralized storage...</i>');

    try {
      // Telegram sends multiple sizes. The last element is the highest resolution.
      const largestPhoto = update.message.photo[update.message.photo.length - 1];
      const fileId = largestPhoto.file_id;

      // 1. Get file path from Telegram
      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
      if (!r.ok) throw new Error('Failed to fetch file path from Telegram API');

      const fileData = await r.json();
      if (!fileData.ok) throw new Error(fileData.description || 'Telegram getFile returned false');

      const filePath = fileData.result.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

      // 2. Upload using IPFSService (automatically handles URL downloads directly to FreeImage/Catbox)
      const { ipfsUrl } = await ipfsService.uploadImage(fileUrl);

      // 3. Reply with the URL (MarkdownV2 or HTML for easy copying)
      await msg(chatId,
        `✅ <b>Image Uploaded Successfully!</b>\n\n` +
        `🌐 <b>URL:</b>\n<code>${ipfsUrl}</code>\n\n` +
        `<i>Tap the link above to copy it, then paste it into the Terminal when deploying your token.</i>`,
        { reply_to_message_id: update.message?.message_id || undefined } // Added optional reply mapping
      );

    } catch (e: any) {
      console.error('[tg-photo-handler]', e);
      await msg(chatId, `❌ <b>Failed to process image:</b> ${e.message}`);
    }
  }

  // ── Callbacks ─────────────────────────────────────────────────────────────
  if (update.callback_query) {
    const { id, data, from: f } = update.callback_query;
    if (data?.startsWith('myid_')) {
      await cb(id, ''); await msg(f.id, `🆔 <b>Your ID:</b> <code>${data.replace('myid_', '')}</code>`);
    } else if (data === 'check_access') {
      const ok = isAdminUser(f.id) || await getAccess(f.id);
      await cb(id, ok ? '✅ Access confirmed! /start' : '🔒 Not authorized yet', true);
    } else if (data === 'stats' && isAdminUser(f.id)) {
      try {
        await initDatabase(); const s = await getUserStats();
        await cb(id, `👥 ${s.totalUsers} | ✅ ${s.usersWithAccess} | 🚀 ${s.totalDeployments}`, true);
      } catch { await cb(id, 'Error', true); }
    } else if (data === 'ver') {
      await cb(id, `v${APP_VERSION} · Bot API 9.4`, true);
    }
  }

  return NextResponse.json({ ok: true, lastError });
}
