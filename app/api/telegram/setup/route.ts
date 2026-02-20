import { NextRequest, NextResponse } from 'next/server';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

// GET - Setup webhook and bot commands
export async function GET(request: NextRequest) {
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 });
  }

  const webhookUrl = request.nextUrl.searchParams.get('webhook_url');
  
  if (!webhookUrl) {
    // Just get current webhook info
    const info = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const data = await info.json();
    return NextResponse.json({ 
      message: 'Add ?webhook_url=YOUR_URL to set webhook',
      current: data 
    });
  }

  try {
    // Set webhook
    const webhookResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query'],
      }),
    });
    const webhookResult = await webhookResponse.json();

    // Set bot commands for regular users
    const userCommands = [
      { command: 'start', description: '🚀 Start bot & show menu' },
      { command: 'menu', description: '📋 Show menu' },
      { command: 'myid', description: '🆔 Show your Telegram ID' },
      { command: 'mycode', description: '🔑 Get your access code' },
      { command: 'deploy', description: '🎯 Deploy a token' },
      { command: 'help', description: '❓ Show help' },
    ];

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: userCommands }),
    });

    // Set admin commands (for private chats with admins)
    const adminCommands = [
      { command: 'start', description: '🚀 Start bot & show admin menu' },
      { command: 'menu', description: '📋 Show admin menu' },
      { command: 'myid', description: '🆔 Show your Telegram ID' },
      { command: 'grant', description: '➕ Grant access: /grant USER_ID' },
      { command: 'revoke', description: '➖ Revoke access: /revoke USER_ID' },
      { command: 'users', description: '👥 List users with access' },
      { command: 'deploy', description: '🎯 Deploy a token' },
      { command: 'help', description: '❓ Show help' },
    ];

    // Note: setMyCommands with scope requires bot to know admin IDs
    // For simplicity, we just set default commands

    return NextResponse.json({
      success: true,
      webhook: webhookResult,
      commands: 'Set successfully',
      message: 'Bot is ready! Send /start to your bot.',
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 });
  }
}
