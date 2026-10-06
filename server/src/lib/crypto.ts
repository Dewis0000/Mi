import crypto from 'node:crypto';
import { config } from '../config.js';

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const randomCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

export function hmac(payload: string) {
  return crypto.createHmac('sha256', config.SIGNING_SECRET).update(payload).digest('base64url');
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Подписанная временная ссылка: payload + срок + подпись */
export function signUrlParams(key: string, expiresAt: Date) {
  const exp = Math.floor(expiresAt.getTime() / 1000);
  return { exp, sig: hmac(`${key}:${exp}`) };
}

export function verifyUrlParams(key: string, exp: number, sig: string) {
  if (!exp || exp * 1000 < Date.now()) return false;
  return safeEqual(hmac(`${key}:${exp}`), sig);
}
