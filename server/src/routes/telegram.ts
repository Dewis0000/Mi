import { Router } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { hmac, safeEqual } from '../lib/crypto.js';

/**
 * Webhook Telegram-бота: привязка аккаунта по ссылке t.me/<bot>?start=<token>.
 * Регистрация: setWebhook на {API_URL}/api/telegram/webhook с secret_token = SIGNING_SECRET-хэш.
 */
export const telegramRouter = Router();
export const telegramSecret = () => hmac('tg-webhook').slice(0, 32);

telegramRouter.post('/webhook', async (req, res) => {
  if (!safeEqual(req.header('x-telegram-bot-api-secret-token') ?? '', telegramSecret())) return res.sendStatus(403);
  const msg = req.body?.message;
  const text: string = msg?.text ?? '';
  const chatId = msg?.chat?.id;
  const match = text.match(/^\/start\s+(\w+)_([\w-]{16})$/);
  if (match && chatId) {
    const [, userId, sig] = match;
    if (safeEqual(sig, hmac(`tg:${userId}`).slice(0, 16))) {
      await prisma.user.update({ where: { id: userId }, data: { telegramChatId: String(chatId) } }).catch(() => null);
      if (config.TELEGRAM_BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: 'Готово! Уведомления «Чёрного хода» будут приходить сюда. 🕯' }),
        }).catch(() => null);
      }
    }
  }
  res.json({ ok: true });
});
