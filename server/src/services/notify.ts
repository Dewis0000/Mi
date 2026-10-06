import type { Messenger, User } from '@prisma/client';
import { config, isDev } from '../config.js';

/**
 * Отправка кодов подтверждения и уведомлений в мессенджеры.
 * Каждый провайдер работает, только если задан его токен; иначе сообщение пишется в лог
 * (удобно для локальной разработки).
 */

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${await res.text()}`);
  return res.json();
}

const providers = {
  /** Telegram Gateway API умеет отправлять коды по номеру телефона */
  async TELEGRAM_CODE(phone: string, code: string) {
    if (!config.TELEGRAM_GATEWAY_TOKEN) return false;
    await postJson(
      'https://gatewayapi.telegram.org/sendVerificationMessage',
      { phone_number: phone, code, ttl: 300 },
      { Authorization: `Bearer ${config.TELEGRAM_GATEWAY_TOKEN}` },
    );
    return true;
  },
  async TELEGRAM(chatId: string, text: string) {
    if (!config.TELEGRAM_BOT_TOKEN) return false;
    await postJson(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
    return true;
  },
  /** Сообщение от сообщества ВКонтакте (пользователь должен разрешить сообщения) */
  async VK(userId: string, text: string) {
    if (!config.VK_GROUP_TOKEN) return false;
    const params = new URLSearchParams({
      user_id: userId,
      message: text.replace(/<[^>]+>/g, ''),
      random_id: String(Date.now()),
      access_token: config.VK_GROUP_TOKEN,
      v: '5.199',
    });
    const res = await fetch(`https://api.vk.com/method/messages.send?${params}`, { method: 'POST' });
    return res.ok;
  },
  /** Бот в мессенджере MAX */
  async MAX(userId: string, text: string) {
    if (!config.MAX_BOT_TOKEN) return false;
    await postJson(
      `https://platform-api.max.ru/messages?user_id=${encodeURIComponent(userId)}`,
      { text, format: 'html' },
      { Authorization: config.MAX_BOT_TOKEN },
    );
    return true;
  },
};

function log(channel: string, to: string, text: string) {
  console.log(`[notify:${channel}] → ${to}\n${text}\n`);
}

export async function sendCode(phone: string, channel: Messenger, code: string, user?: User | null) {
  const text = `Код подтверждения «Чёрный ход»: <b>${code}</b>. Никому его не сообщайте.`;
  try {
    let sent = false;
    if (channel === 'TELEGRAM') sent = await providers.TELEGRAM_CODE(phone, code);
    else if (channel === 'VK' && user?.vkUserId) sent = await providers.VK(user.vkUserId, text);
    else if (channel === 'MAX' && user?.maxUserId) sent = await providers.MAX(user.maxUserId, text);
    if (!sent) log(channel, phone, text);
    return sent || isDev;
  } catch (e) {
    console.error('sendCode failed', e);
    log(channel, phone, text);
    return isDev;
  }
}

export async function notifyUser(user: User, text: string) {
  try {
    let sent = false;
    if (user.messenger === 'TELEGRAM' && user.telegramChatId) sent = await providers.TELEGRAM(user.telegramChatId, text);
    if (user.messenger === 'VK' && user.vkUserId) sent = await providers.VK(user.vkUserId, text);
    if (user.messenger === 'MAX' && user.maxUserId) sent = await providers.MAX(user.maxUserId, text);
    if (!sent) log(user.messenger, user.phone, text);
  } catch (e) {
    console.error('notifyUser failed', e);
  }
}

export async function notifyAdmins(text: string) {
  try {
    if (config.ADMIN_TELEGRAM_CHAT_ID && (await providers.TELEGRAM(config.ADMIN_TELEGRAM_CHAT_ID, text))) return;
  } catch (e) {
    console.error('notifyAdmins failed', e);
  }
  log('admins', 'staff', text);
}

const fmt = (d: Date) =>
  d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', weekday: 'short' });
const rub = (n: number) => n.toLocaleString('ru-RU') + ' ₽';

/** Шаблоны сообщений */
export const templates = {
  bookingCreated: (b: { questTitle: string; startAt: Date; playersCount: number; finalPrice: number }) =>
    `🕯 <b>Вы записаны на «${b.questTitle}»</b>\n${fmt(b.startAt)}\nИгроков: ${b.playersCount}\nК оплате: ${rub(b.finalPrice)}\n\nПриходите за 15 минут до начала. Отменить или перенести запись можно в личном кабинете: ${config.APP_URL}/profile`,
  bookingConfirmed: (b: { questTitle: string; startAt: Date }) =>
    `✅ Запись на «${b.questTitle}» подтверждена — ${fmt(b.startAt)}. Ждём вас.`,
  bookingCancelled: (b: { questTitle: string; startAt: Date }) =>
    `✖️ Запись на «${b.questTitle}» (${fmt(b.startAt)}) отменена.`,
  reminder: (b: { questTitle: string; startAt: Date }, hours: number) =>
    `⏳ Напоминание: через ${hours === 24 ? 'сутки' : '2 часа'} — «${b.questTitle}», ${fmt(b.startAt)}.\nНе опаздывайте: двери закрываются ровно в назначенное время.`,
  pointsBurnWarning: (points: number, date: Date) =>
    `🔥 Ваши баллы (${points}) начнут сгорать ${date.toLocaleDateString('ru-RU')}. Приходите на квест, чтобы сохранить скидку!`,
  adminNewBooking: (b: { questTitle: string; startAt: Date; playersCount: number; phone: string; name?: string | null }) =>
    `🆕 <b>Новая заявка</b>: «${b.questTitle}»\n${fmt(b.startAt)} · ${b.playersCount} игр.\n${b.name ?? 'Без имени'}, ${b.phone}`,
};
