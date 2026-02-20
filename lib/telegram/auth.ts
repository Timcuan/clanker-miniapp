
import crypto from 'crypto';

/**
 * Validates the Telegram WebApp initData string.
 * @param initData The initData string passed from the WebApp.
 * @param botToken The Telegram Bot Token.
 * @returns boolean indicating if detailed validation passed.
 */
export function validateTelegramWebAppData(initData: string, botToken: string = process.env.TELEGRAM_BOT_TOKEN!): boolean {
    if (!initData) return false;
    if (!botToken) {
        console.error('TELEGRAM_BOT_TOKEN is not defined');
        return false;
    }

    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');

    if (!hash) return false;

    urlParams.delete('hash');

    // Sort keys alphabetically
    const params: string[] = [];
    Array.from(urlParams.entries()).forEach(([key, value]) => {
        params.push(`${key}=${value}`);
    });
    params.sort();

    const dataCheckString = params.join('\n');

    const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();

    const computedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    return computedHash === hash;
}

/**
 * Parses the user object from the initData string.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseTelegramWebAppData(initData: string): any {
    if (!initData) return null;
    const urlParams = new URLSearchParams(initData);
    const user = urlParams.get('user');
    if (user) {
        try {
            return JSON.parse(user);
        } catch (e) {
            console.error('Failed to parse user data:', e);
            return null;
        }
    }
    return null;
}
