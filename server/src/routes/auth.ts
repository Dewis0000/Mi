import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config, isDev } from '../config.js';
import { prisma } from '../db.js';
import { verifyCaptcha } from '../lib/captcha.js';
import { randomCode, randomToken, sha256 } from '../lib/crypto.js';
import { HttpError, ah, badRequest, parse } from '../lib/http.js';
import { ACCESS_TTL_SEC, REFRESH_TTL_DAYS, signAccess } from '../lib/jwt.js';
import { phoneSchema } from '../lib/phone.js';
import { serializeUser } from '../lib/serialize.js';
import { sendCode } from '../services/notify.js';

export const authRouter = Router();

const CODE_TTL_MIN = 5;
const RESEND_SEC = 60;
const MAX_CODES_PER_WINDOW = 3;
const WINDOW_MIN = 10;
const MAX_ATTEMPTS = 5;

const REFRESH_COOKIE = 'rt';
/** Несекретный маркер «есть сессия»: фронтенд не дёргает /refresh у анонимных посетителей */
const SESSION_MARKER = 'hs';

const codeHash = (phone: string, code: string) => sha256(`${phone}:${code}:${config.SIGNING_SECRET}`);

/** Общая логика выдачи кода: rate limit (3 кода за 10 минут на номер) + пауза 60 сек */
export async function issueCode(phone: string, channel: 'TELEGRAM' | 'VK' | 'MAX', purpose: string) {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  const recent = await prisma.verificationCode.findMany({
    where: { phone, createdAt: { gt: since } },
    orderBy: { createdAt: 'desc' },
  });
  if (recent.length >= MAX_CODES_PER_WINDOW) {
    const retryAt = new Date(recent[recent.length - 1].createdAt.getTime() + WINDOW_MIN * 60_000);
    throw new HttpError(429, 'Слишком много запросов кода. Попробуйте позже.', 'RATE_LIMIT', {
      retryIn: Math.ceil((retryAt.getTime() - Date.now()) / 1000),
    });
  }
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_SEC * 1000) {
    throw new HttpError(429, 'Код уже отправлен. Подождите перед повторной отправкой.', 'RESEND_WAIT', {
      retryIn: Math.ceil((recent[0].createdAt.getTime() + RESEND_SEC * 1000 - Date.now()) / 1000),
    });
  }

  const code = randomCode();
  await prisma.verificationCode.create({
    data: {
      phone,
      purpose,
      channel,
      codeHash: codeHash(phone, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000),
    },
  });
  const user = await prisma.user.findUnique({ where: { phone } });
  const delivered = await sendCode(phone, channel, code, user);
  if (!delivered) throw new HttpError(502, 'Не удалось отправить код. Выберите другой способ.', 'DELIVERY_FAILED');
  return { resendIn: RESEND_SEC, devCode: isDev ? code : undefined };
}

export async function consumeCode(phone: string, code: string, purpose: string) {
  const record = await prisma.verificationCode.findFirst({
    where: { phone, purpose, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw badRequest('Код истёк или не запрашивался. Запросите новый.', 'CODE_EXPIRED');
  if (record.attempts >= MAX_ATTEMPTS) throw badRequest('Превышено число попыток. Запросите новый код.', 'CODE_ATTEMPTS');
  if (record.codeHash !== codeHash(phone, code)) {
    await prisma.verificationCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    throw badRequest('Неверный код', 'CODE_INVALID', { attemptsLeft: MAX_ATTEMPTS - record.attempts - 1 });
  }
  await prisma.verificationCode.update({ where: { id: record.id }, data: { consumed: true } });
}

async function issueTokens(res: Response, userId: string) {
  const refresh = randomToken(48);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
  await prisma.refreshToken.create({ data: { userId, tokenHash: sha256(refresh), expiresAt } });
  res.cookie(REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure: !isDev,
    sameSite: 'lax',
    path: '/api/auth',
    expires: expiresAt,
  });
  res.cookie(SESSION_MARKER, '1', { secure: !isDev, sameSite: 'lax', path: '/', expires: expiresAt });
  return { accessToken: signAccess(userId), expiresIn: ACCESS_TTL_SEC };
}

const channelSchema = z.enum(['TELEGRAM', 'VK', 'MAX']);

authRouter.post(
  '/code',
  ah(async (req, res) => {
    const body = parse(
      z.object({
        phone: phoneSchema,
        channel: channelSchema,
        consent: z.boolean().optional(),
        captchaToken: z.string().optional(),
        website: z.string().optional(), // honeypot: поле скрыто от людей
      }),
      req.body,
    );
    if (body.website) return res.json({ ok: true, resendIn: RESEND_SEC });
    if (!(await verifyCaptcha(body.captchaToken, req.ip))) throw badRequest('Проверка на робота не пройдена', 'CAPTCHA');

    const existing = await prisma.user.findUnique({ where: { phone: body.phone } });
    if (existing?.blocked) throw new HttpError(403, 'Аккаунт заблокирован. Свяжитесь с администратором.', 'BLOCKED');
    if (!existing && !body.consent) {
      throw badRequest('Необходимо согласие на обработку персональных данных', 'CONSENT_REQUIRED');
    }
    const result = await issueCode(body.phone, body.channel, 'auth');
    res.json({ ok: true, isNewUser: !existing, hasPassword: !!existing?.passwordHash, ...result });
  }),
);

authRouter.post(
  '/verify',
  ah(async (req, res) => {
    const body = parse(
      z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/, 'Код — 6 цифр'), channel: channelSchema.optional() }),
      req.body,
    );
    await consumeCode(body.phone, body.code, 'auth');
    const user = await prisma.user.upsert({
      where: { phone: body.phone },
      create: { phone: body.phone, phoneVerified: true, messenger: body.channel ?? 'TELEGRAM' },
      update: { phoneVerified: true },
      include: { role: true },
    });
    if (user.blocked) throw new HttpError(403, 'Аккаунт заблокирован', 'BLOCKED');
    const tokens = await issueTokens(res, user.id);
    res.json({ ...tokens, user: serializeUser(user), needsProfile: !user.name });
  }),
);

authRouter.post(
  '/password',
  ah(async (req, res) => {
    const body = parse(z.object({ phone: phoneSchema, password: z.string().min(1) }), req.body);
    const user = await prisma.user.findUnique({ where: { phone: body.phone }, include: { role: true } });
    const ok = user?.passwordHash && (await bcrypt.compare(body.password, user.passwordHash));
    if (!user || !ok) throw new HttpError(401, 'Неверный телефон или пароль', 'BAD_CREDENTIALS');
    if (user.blocked) throw new HttpError(403, 'Аккаунт заблокирован', 'BLOCKED');
    const tokens = await issueTokens(res, user.id);
    res.json({ ...tokens, user: serializeUser(user), needsProfile: !user.name });
  }),
);

authRouter.post(
  '/refresh',
  ah(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      res.clearCookie(SESSION_MARKER, { path: '/' });
      throw new HttpError(401, 'Сессия истекла', 'NO_REFRESH');
    }
    const record = await prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { include: { role: true } } },
    });
    if (!record || record.revoked || record.expiresAt < new Date() || record.user.blocked) {
      res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
      res.clearCookie(SESSION_MARKER, { path: '/' });
      throw new HttpError(401, 'Сессия истекла', 'BAD_REFRESH');
    }
    // ротация refresh-токена
    await prisma.refreshToken.update({ where: { id: record.id }, data: { revoked: true } });
    const tokens = await issueTokens(res, record.userId);
    res.json({ ...tokens, user: serializeUser(record.user), needsProfile: !record.user.name });
  }),
);

authRouter.post(
  '/logout',
  ah(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(token) }, data: { revoked: true } });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    res.clearCookie(SESSION_MARKER, { path: '/' });
    res.json({ ok: true });
  }),
);
