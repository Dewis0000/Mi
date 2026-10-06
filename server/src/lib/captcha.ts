import { config } from '../config.js';

/** Проверка токена невидимой Яндекс SmartCaptcha. Без ключа — пропускаем (разработка). */
export async function verifyCaptcha(token: string | undefined, ip: string | undefined) {
  if (!config.SMARTCAPTCHA_SERVER_KEY) return true;
  if (!token) return false;
  const q = new URLSearchParams({ secret: config.SMARTCAPTCHA_SERVER_KEY, token, ip: ip ?? '' });
  try {
    const res = await fetch(`https://smartcaptcha.yandexcloud.net/validate?${q}`);
    const data = (await res.json()) as { status: string };
    return data.status === 'ok';
  } catch {
    return false;
  }
}
