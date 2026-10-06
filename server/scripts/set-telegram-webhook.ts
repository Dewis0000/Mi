/**
 * Регистрирует webhook Telegram-бота (привязка аккаунтов по ссылке t.me/<bot>?start=…).
 * Запуск: npm run telegram:webhook
 */
import { config } from '../src/config.js';
import { telegramSecret } from '../src/routes/telegram.js';

if (!config.TELEGRAM_BOT_TOKEN) {
  console.error('Задайте TELEGRAM_BOT_TOKEN в .env');
  process.exit(1);
}
const url = `${config.API_URL.replace(/\/$/, '')}/api/telegram/webhook`;
const res = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url, secret_token: telegramSecret(), allowed_updates: ['message'] }),
});
console.log(url, '→', await res.json());
