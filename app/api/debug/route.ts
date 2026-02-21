import { NextResponse } from 'next/server';

// Temporary debug endpoint — REMOVE AFTER DIAGNOSTICS
export async function GET() {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const primaryAdminId = process.env.PRIMARY_ADMIN_ID || '';
    const adminIds = process.env.ADMIN_TELEGRAM_IDS || '';
    const tursoUrl = process.env.TURSO_DATABASE_URL || '';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

    // Test bot token by calling getMe
    let botInfo: any = null;
    let botError = '';
    if (botToken) {
        try {
            const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
            const data = await res.json();
            botInfo = data.result;
            if (!data.ok) botError = data.description || 'API error';
        } catch (e: any) {
            botError = e.message;
        }
    }

    return NextResponse.json({
        env: {
            TELEGRAM_BOT_TOKEN: botToken ? `SET (${botToken.length} chars, starts: ${botToken.slice(0, 8)}...)` : 'MISSING',
            PRIMARY_ADMIN_ID: primaryAdminId || 'MISSING',
            ADMIN_TELEGRAM_IDS: adminIds || 'MISSING',
            TURSO_DATABASE_URL: tursoUrl ? `SET (${tursoUrl.slice(0, 30)}...)` : 'MISSING',
            NEXT_PUBLIC_APP_URL: appUrl || 'MISSING',
        },
        bot: botInfo
            ? { username: botInfo.username, id: botInfo.id, name: botInfo.first_name }
            : { error: botError || 'token missing' },
    });
}
