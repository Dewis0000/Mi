import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { hmac } from '../lib/crypto.js';
import { HttpError, ah, badRequest, jsonSafe, parse } from '../lib/http.js';
import { nextBurnDate, tierFor } from '../lib/loyalty.js';
import { phoneSchema } from '../lib/phone.js';
import { serializeUser } from '../lib/serialize.js';
import { requireAuth } from '../middleware/auth.js';
import { getSettings } from '../services/settings.js';
import { consumeCode, issueCode } from './auth.js';

export const profileRouter = Router();
profileRouter.use(requireAuth);

profileRouter.get(
  '/',
  ah(async (req, res) => {
    res.json(serializeUser(req.user!));
  }),
);

profileRouter.patch(
  '/',
  ah(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2, 'Имя слишком короткое').max(60).optional(),
        birthDate: z.coerce.date().nullable().optional(),
        email: z.string().trim().email('Некорректный e-mail').nullable().optional().or(z.literal('')),
        messenger: z.enum(['TELEGRAM', 'VK', 'MAX']).optional(),
        vkUserId: z.string().trim().max(40).nullable().optional(),
        maxUserId: z.string().trim().max(40).nullable().optional(),
        notify: z.object({ bookings: z.boolean(), reminders: z.boolean(), promo: z.boolean() }).partial().optional(),
      }),
      req.body,
    );
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        name: body.name,
        birthDate: body.birthDate,
        email: body.email === '' ? null : body.email,
        messenger: body.messenger,
        vkUserId: body.vkUserId,
        maxUserId: body.maxUserId,
        notifyBookings: body.notify?.bookings,
        notifyReminders: body.notify?.reminders,
        notifyPromo: body.notify?.promo,
      },
      include: { role: true },
    });
    res.json(serializeUser(user));
  }),
);

profileRouter.post(
  '/password',
  ah(async (req, res) => {
    const { password } = parse(z.object({ password: z.string().min(8, 'Минимум 8 символов').max(100) }), req.body);
    await prisma.user.update({ where: { id: req.user!.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    res.json({ ok: true });
  }),
);

/** Смена номера — с повторным подтверждением кодом */
profileRouter.post(
  '/phone/code',
  ah(async (req, res) => {
    const body = parse(z.object({ phone: phoneSchema, channel: z.enum(['TELEGRAM', 'VK', 'MAX']) }), req.body);
    if (await prisma.user.findUnique({ where: { phone: body.phone } })) throw badRequest('Этот номер уже занят', 'PHONE_TAKEN');
    res.json({ ok: true, ...(await issueCode(body.phone, body.channel, `change:${req.user!.id}`)) });
  }),
);

profileRouter.post(
  '/phone/verify',
  ah(async (req, res) => {
    const body = parse(z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) }), req.body);
    await consumeCode(body.phone, body.code, `change:${req.user!.id}`);
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { phone: body.phone, phoneVerified: true },
      include: { role: true },
    });
    res.json(serializeUser(user));
  }),
);

/** Ссылка для привязки Telegram через бота (deep link /start <token>) */
profileRouter.get(
  '/link/telegram',
  ah(async (req, res) => {
    const bot = config.TELEGRAM_BOT_USERNAME;
    if (!bot) throw new HttpError(503, 'Telegram-бот не настроен', 'NOT_CONFIGURED');
    const token = `${req.user!.id}_${hmac(`tg:${req.user!.id}`).slice(0, 16)}`;
    res.json({ url: `https://t.me/${bot}?start=${token}` });
  }),
);

/** Баллы: баланс, уровень, ближайшее сгорание и история */
profileRouter.get(
  '/loyalty',
  ah(async (req, res) => {
    const settings = await getSettings();
    const user = req.user!;
    const [log, lastBurn] = await Promise.all([
      prisma.pointsLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.pointsLog.findFirst({ where: { userId: user.id, reason: 'BURN' }, orderBy: { createdAt: 'desc' } }),
    ]);
    const tier = tierFor(user.points, settings.loyalty);
    const burnAt = user.points > 0 ? nextBurnDate(user.lastVisitAt, lastBurn?.createdAt ?? null, settings.loyalty) : null;
    const burnSoon = !!burnAt && burnAt.getTime() - Date.now() < 30 * 86_400_000;
    res.json({
      points: user.points,
      percent: tier.percent,
      nextTier: tier.next,
      tiers: settings.loyalty.tiers,
      pointsPerVisit: settings.loyalty.pointsPerVisit,
      burn: {
        afterMonths: settings.loyalty.burnAfterMonths,
        percentPerMonth: settings.loyalty.burnPercentPerMonth,
        nextAt: burnAt,
        amount: burnAt ? Math.ceil((user.points * settings.loyalty.burnPercentPerMonth) / 100) : 0,
        warning: burnSoon,
      },
      lastVisitAt: user.lastVisitAt,
      log,
    });
  }),
);

/** Видеозаписи прошедших квестов */
profileRouter.get(
  '/recordings',
  ah(async (req, res) => {
    const settings = await getSettings();
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user!.id, status: 'COMPLETED', linkedFrom: { is: null } },
      include: {
        quest: { select: { title: true, photoUrl: true, slug: true } },
        recordings: true,
        linkedBooking: { include: { recordings: true } },
      },
      orderBy: { startAt: 'desc' },
    });
    const now = Date.now();
    res.json(
      jsonSafe(
        bookings.map((b) => ({
          bookingId: b.id,
          quest: b.quest,
          startAt: b.startAt,
          recordings: [...b.recordings, ...(b.linkedBooking?.recordings ?? [])].map((r) => ({
            id: r.id,
            durationSec: r.durationSec,
            sizeBytes: r.sizeBytes,
            price: r.price || settings.recordings.price,
            isPurchased: r.isPurchased,
            expiresAt: r.expiresAt,
            downloadable: r.isPurchased && !!r.expiresAt && r.expiresAt.getTime() > now,
            available: !r.deleteAfter || r.deleteAfter.getTime() > now,
          })),
        })),
      ),
    );
  }),
);
