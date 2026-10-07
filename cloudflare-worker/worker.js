/**
 * Neru-Квест — бот-сервис на Cloudflare Worker.
 * Отдельный всегда-работающий сервис: Telegram и MAX шлют сюда webhook'и
 * (Cloudflare доступен для них, в отличие от reg.ru), а сайт обращается сюда
 * исходящими запросами (это у reg.ru работает).
 *
 * Хранит привязки «номер → чат» и коды входа в KV. Коды проверяет сам.
 *
 * Переменные окружения (Settings → Variables and Secrets):
 *   TG_TOKEN        — токен Telegram-бота
 *   MAX_TOKEN       — токен MAX-бота
 *   WEBHOOK_SECRET  — секрет для webhook'ов (Telegram secret_token и MAX ?s=)
 *   SITE_SECRET     — секрет для запросов с сайта (Authorization: Bearer ...)
 *   TG_USERNAME     — имя Telegram-бота без @ (для ссылки t.me/...)
 *   MAX_USERNAME    — имя MAX-бота (для ссылки max.ru/...)
 *   OWNER_PHONES    — телефоны владельцев через запятую (для текста уведомлений)
 * Binding KV namespace с именем: KV
 */

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json;charset=utf-8' } });

function normPhone(input) {
  if (typeof input !== 'string') return null;
  let d = input.replace(/\D/g, '');
  if (d.length === 11 && (d[0] === '8' || d[0] === '7')) d = '7' + d.slice(1);
  else if (d.length === 10) d = '7' + d;
  else return null;
  return '+' + d;
}
function extractPhone(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/(\+?\d[\d\s\-()]{9,}\d)/);
  return m ? m[1] : null;
}
const code6 = () => String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
const SITE_URL = 'https://nery-quest.ru';

async function tgSend(env, chatId, text, extra = {}) {
  if (!env.TG_TOKEN) return false;
  const r = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }),
  });
  return r.ok;
}
async function maxSend(env, chatId, text, attachments) {
  if (!env.MAX_TOKEN) return false;
  const body = { text };
  if (attachments) body.attachments = attachments;
  const r = await fetch(`https://botapi.max.ru/messages?chat_id=${encodeURIComponent(chatId)}`, {
    method: 'POST',
    headers: { authorization: env.MAX_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.ok;
}
const maxKeyboard = () => [{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'request_contact', text: '📱 Поделиться номером' }]] } }];

function isStaff(env, phone) {
  return (env.OWNER_PHONES || '').split(',').map((s) => s.trim()).filter(Boolean).includes(phone);
}
async function linkAndCode(env, platform, phone, chatId) {
  await env.KV.put(`link:${platform}:${phone}`, String(chatId));
  const c = code6();
  await env.KV.put(`code:${phone}`, c, { expirationTtl: 300 });
  return c;
}

async function tgWebhook(request, env) {
  if ((request.headers.get('x-telegram-bot-api-secret-token') || '') !== env.WEBHOOK_SECRET) return json({ ok: true });
  const upd = await request.json().catch(() => ({}));
  const msg = upd.message || upd.edited_message;
  const chatId = msg && msg.chat ? msg.chat.id : null;
  if (chatId == null) return json({ ok: true });
  if (msg.contact) {
    const c = msg.contact;
    const own = c.user_id != null && msg.from && String(c.user_id) === String(msg.from.id);
    const phone = own ? normPhone(c.phone_number) : null;
    if (phone) {
      const code = await linkAndCode(env, 'TELEGRAM', phone, chatId);
      const tail = isStaff(env, phone) ? '\n\nСюда также будут приходить уведомления о новых записях.' : '';
      await tgSend(env, chatId, `✅ Готово! Номер <b>${phone}</b> привязан.\n\nВаш код для входа на сайт: <b>${code}</b>\nВведите его на странице входа (действует 5 минут).${tail}\n\n🌐 Сайт: ${SITE_URL}`, { reply_markup: { remove_keyboard: true } });
    } else {
      await tgSend(env, chatId, 'Пожалуйста, поделитесь своим собственным номером — кнопкой ниже.');
    }
    return json({ ok: true });
  }
  await tgSend(env, chatId, `Здравствуйте! Это бот <b>Neru-Квест</b> 🧛\n\nНажмите кнопку ниже и поделитесь номером телефона — на него приходят коды для входа на сайт и напоминания о бронях.\n\n🌐 Сайт: ${SITE_URL}`, {
    reply_markup: { keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
  });
  return json({ ok: true });
}

async function maxWebhook(request, url, env) {
  if ((url.searchParams.get('s') || '') !== env.WEBHOOK_SECRET) return json({ ok: true });
  const upd = await request.json().catch(() => ({}));
  try { await env.KV.put('debug:maxlast', JSON.stringify(upd), { expirationTtl: 1800 }); } catch (e) {}
  const type = upd.update_type;
  const msg = upd.message || {};
  const chatId = (msg.recipient && msg.recipient.chat_id) ?? upd.chat_id ?? (msg.sender && msg.sender.user_id) ?? null;
  const welcome = `Здравствуйте! Это бот <b>Neru-Квест</b>. Нажмите «Поделиться номером» или просто отправьте свой номер телефона сообщением — на него будут приходить коды для входа и напоминания о бронях.\n\n🌐 Сайт: ${SITE_URL}`;
  if (type === 'bot_started') {
    if (chatId != null) await maxSend(env, chatId, welcome, maxKeyboard());
    return json({ ok: true });
  }
  if (type !== 'message_created') return json({ ok: true });

  // телефон: из контакта (разные форматы) → из текста → из всего тела сообщения
  let phone = null;
  const atts = (msg.body && msg.body.attachments) || [];
  for (const att of atts) {
    const pl = att.payload || att.contact || att || {};
    phone = phone || normPhone(extractPhone(pl.phone || pl.vcfInfo || pl.vcfPhone || pl.number || pl.vcard || ''));
  }
  if (!phone) phone = normPhone(extractPhone((msg.body && msg.body.text) || ''));
  if (!phone && atts.length) phone = normPhone(extractPhone(JSON.stringify(atts)));
  if (!phone && msg.body) phone = normPhone(extractPhone(JSON.stringify(msg.body)));

  if (phone && chatId != null) {
    const code = await linkAndCode(env, 'MAX', phone, chatId);
    const tail = isStaff(env, phone) ? '\n\nСюда также будут приходить уведомления о новых записях.' : '';
    await maxSend(env, chatId, `✅ Готово! Номер ${phone} привязан.\n\nВаш код для входа на сайт: ${code}\nВведите его на странице входа (действует 5 минут).${tail}\n\n🌐 Сайт: ${SITE_URL}`);
  } else if (chatId != null) {
    await maxSend(env, chatId, welcome, maxKeyboard());
  }
  return json({ ok: true });
}

const siteAuth = (request, env) => (request.headers.get('authorization') || '') === `Bearer ${env.SITE_SECRET}`;

async function apiRequestCode(request, env) {
  if (!siteAuth(request, env)) return json({ error: 'forbidden' }, 403);
  const { phone: raw, channel } = await request.json().catch(() => ({}));
  const phone = normPhone(raw);
  if (!phone) return json({ error: 'bad phone' }, 400);
  const tg = await env.KV.get(`link:TELEGRAM:${phone}`);
  const mx = await env.KV.get(`link:MAX:${phone}`);
  const deliver = async (chatId, kind) => {
    const c = code6();
    await env.KV.put(`code:${phone}`, c, { expirationTtl: 300 });
    const text = `Ваш код для входа на Neru-Квест: ${c}`;
    const ok = kind === 'max' ? await maxSend(env, chatId, text) : await tgSend(env, chatId, `Ваш код для входа на Neru-Квест: <b>${c}</b>`);
    return ok;
  };
  if (channel === 'MAX' && mx) return json({ delivered: await deliver(mx, 'max'), channel: 'max' });
  if (tg) return json({ delivered: await deliver(tg, 'tg'), channel: 'telegram' });
  if (mx) return json({ delivered: await deliver(mx, 'max'), channel: 'max' });
  const botUrl = channel === 'MAX'
    ? (env.MAX_USERNAME ? `https://max.ru/${env.MAX_USERNAME}` : null)
    : (env.TG_USERNAME ? `https://t.me/${env.TG_USERNAME}?start=auth` : null);
  return json({ delivered: false, needsMessenger: true, botUrl, messenger: channel || 'TELEGRAM' });
}

async function apiVerifyCode(request, env) {
  if (!siteAuth(request, env)) return json({ error: 'forbidden' }, 403);
  const { phone: raw, code } = await request.json().catch(() => ({}));
  const phone = normPhone(raw);
  if (!phone || !/^\d{6}$/.test(String(code || ''))) return json({ ok: false }, 400);
  const stored = await env.KV.get(`code:${phone}`);
  if (stored && stored === String(code)) {
    await env.KV.delete(`code:${phone}`);
    return json({ ok: true });
  }
  return json({ ok: false });
}

async function apiSend(request, env) {
  if (!siteAuth(request, env)) return json({ error: 'forbidden' }, 403);
  const { phone: raw, text } = await request.json().catch(() => ({}));
  const phone = normPhone(raw);
  if (!phone || !text) return json({ ok: false }, 400);
  const tg = await env.KV.get(`link:TELEGRAM:${phone}`);
  const mx = await env.KV.get(`link:MAX:${phone}`);
  let sent = false;
  if (tg) sent = (await tgSend(env, tg, text)) || sent;
  if (mx) sent = (await maxSend(env, mx, text)) || sent;
  return json({ ok: sent });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (request.method === 'POST' && path === '/tg/webhook') return await tgWebhook(request, env);
      if (request.method === 'POST' && path === '/max/webhook') return await maxWebhook(request, url, env);
      if (request.method === 'POST' && path === '/api/request-code') return await apiRequestCode(request, env);
      if (request.method === 'POST' && path === '/api/verify-code') return await apiVerifyCode(request, env);
      if (request.method === 'POST' && path === '/api/send') return await apiSend(request, env);
      if (path === '/' || path === '/health') return json({ ok: true, service: 'neru-bot' });
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: 'server', detail: String(e && e.message || e) }, 500);
    }
  },
};
