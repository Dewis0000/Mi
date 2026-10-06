import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { randomToken } from '../../lib/crypto.js';
import { ah, badRequest, forbidden, notFound, parse } from '../../lib/http.js';
import { adminLog, hasPerm, requirePerm } from '../../middleware/auth.js';
import { defaultSettings, getSettings, setSetting, type SettingKey } from '../../services/settings.js';
import { localDir } from '../../services/storage.js';

export const adminContentRouter = Router();

/* ---------- Квесты ---------- */

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Формат ЧЧ:ММ');
const questSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, 'Только латиница, цифры и дефис').min(2).max(60),
  title: z.string().trim().min(2).max(80),
  shortDescription: z.string().trim().min(10).max(300),
  description: z.string().trim().min(10).max(5000),
  photoUrl: z.string().trim().min(1),
  fearLevel: z.number().int().min(1).max(5),
  minPlayers: z.number().int().min(1).max(20),
  maxPlayers: z.number().int().min(1).max(30),
  durationMin: z.number().int().min(15).max(300),
  minAge: z.number().int().min(0).max(21),
  basePrice: z.number().int().min(0),
  peakExtra: z.number().int().min(0).default(0),
  roomNumber: z.number().int().min(1).max(99),
  isActive: z.boolean(),
  sortOrder: z.number().int().default(0),
  tags: z.array(z.string().trim().max(30)).max(8).default([]),
  schedules: z
    .array(z.object({ weekday: z.number().int().min(0).max(6), timeFrom: time, timeTo: time, breakMin: z.number().int().min(0).max(120) }))
    .default([]),
});

adminContentRouter.get(
  '/quests',
  requirePerm('dashboard.view'),
  ah(async (_req, res) => {
    res.json(await prisma.quest.findMany({ include: { schedules: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }));
  }),
);

adminContentRouter.post(
  '/quests',
  requirePerm('quests.edit'),
  ah(async (req, res) => {
    const { schedules, ...data } = parse(questSchema, req.body);
    if (data.minPlayers > data.maxPlayers) throw badRequest('Минимум игроков больше максимума');
    const quest = await prisma.quest.create({ data: { ...data, schedules: { create: schedules } }, include: { schedules: true } });
    await adminLog(req, 'quest.create', 'Quest', quest.id, data);
    res.status(201).json(quest);
  }),
);

adminContentRouter.put(
  '/quests/:id',
  requirePerm('quests.edit'),
  ah(async (req, res) => {
    const { schedules, ...data } = parse(questSchema, req.body);
    if (data.minPlayers > data.maxPlayers) throw badRequest('Минимум игроков больше максимума');
    const quest = await prisma.$transaction(async (tx) => {
      await tx.schedule.deleteMany({ where: { questId: req.params.id } });
      return tx.quest.update({
        where: { id: req.params.id },
        data: { ...data, schedules: { create: schedules } },
        include: { schedules: true },
      });
    });
    await adminLog(req, 'quest.update', 'Quest', quest.id, { ...data, schedules });
    res.json(quest);
  }),
);

adminContentRouter.delete(
  '/quests/:id',
  requirePerm('quests.edit'),
  ah(async (req, res) => {
    const used = await prisma.booking.count({ where: { questId: req.params.id } });
    if (used) {
      // квест с историей записей не удаляем, а скрываем
      await prisma.quest.update({ where: { id: req.params.id }, data: { isActive: false } });
      await adminLog(req, 'quest.hide', 'Quest', req.params.id);
      return res.json({ ok: true, hidden: true });
    }
    await prisma.quest.delete({ where: { id: req.params.id } });
    await adminLog(req, 'quest.delete', 'Quest', req.params.id);
    res.json({ ok: true });
  }),
);

/** Загрузка изображений (фото квестов) */
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|avif)$/.test(file.mimetype)),
});

adminContentRouter.post(
  '/uploads',
  requirePerm('quests.edit'),
  imageUpload.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw badRequest('Нужен файл изображения (jpg, png, webp, avif)');
    const ext = req.file.mimetype.split('/')[1].replace('jpeg', 'jpg');
    const name = `${Date.now()}-${randomToken(6)}.${ext}`;
    const dir = path.join(localDir, 'uploads');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), req.file.buffer);
    await adminLog(req, 'upload', 'File', name);
    res.status(201).json({ url: `${config.API_URL}/uploads/${name}` });
  }),
);

/* ---------- Настройки и тексты ---------- */

const settingPerm: Record<SettingKey, 'content.edit' | 'settings.edit'> = {
  site: 'content.edit',
  contacts: 'content.edit',
  booking: 'settings.edit',
  loyalty: 'settings.edit',
  recordings: 'settings.edit',
};

const settingSchemas: Record<SettingKey, z.ZodTypeAny> = {
  site: z.object({ name: z.string().max(60), tagline: z.string().max(120), heroTitle: z.string().max(120), heroText: z.string().max(600), aboutText: z.string().max(3000) }).partial(),
  contacts: z
    .object({
      address: z.string().max(200),
      addressNote: z.string().max(200),
      lat: z.number(),
      lon: z.number(),
      phone: z.string().max(40),
      email: z.string().max(100),
      hours: z.string().max(100),
      telegram: z.string().max(200),
      vk: z.string().max(200),
      max: z.string().max(200),
    })
    .partial(),
  booking: z
    .object({
      prepayMode: z.enum(['none', 'prepay']),
      prepayPercent: z.number().int().min(0).max(100),
      holdMinutes: z.number().int().min(1).max(60),
      cancelHours: z.number().int().min(0).max(168),
      horizonDays: z.number().int().min(1).max(365),
    })
    .partial(),
  loyalty: z
    .object({
      pointsPerVisit: z.number().int().min(0).max(10000),
      tiers: z.array(z.object({ from: z.number().int().min(0), percent: z.number().int().min(0).max(50) })).min(1).max(10),
      burnAfterMonths: z.number().int().min(1).max(60),
      burnPercentPerMonth: z.number().int().min(1).max(100),
    })
    .partial(),
  recordings: z
    .object({ price: z.number().int().min(0), linkDays: z.number().int().min(1).max(365), retentionDays: z.number().int().min(1).max(3650) })
    .partial(),
};

adminContentRouter.get(
  '/settings',
  requirePerm('dashboard.view'),
  ah(async (_req, res) => {
    res.json(await getSettings());
  }),
);

adminContentRouter.put(
  '/settings/:key',
  ah(async (req, res) => {
    const key = req.params.key as SettingKey;
    if (!(key in defaultSettings)) throw notFound();
    if (!hasPerm(req.user, settingPerm[key])) throw forbidden();
    const value = parse(settingSchemas[key], req.body);
    const merged = await setSetting(key, value);
    await adminLog(req, 'settings.update', 'Setting', key, value);
    res.json(merged);
  }),
);

/* ---------- Промокоды и подарочные сертификаты ---------- */

adminContentRouter.get(
  '/promocodes',
  requirePerm('promo.edit'),
  ah(async (_req, res) => {
    res.json(await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } }));
  }),
);

adminContentRouter.post(
  '/promocodes',
  requirePerm('promo.edit'),
  ah(async (req, res) => {
    const body = parse(
      z
        .object({
          code: z.string().trim().min(3).max(40).transform((s) => s.toUpperCase()).optional(),
          isCertificate: z.boolean().default(false),
          discountPercent: z.number().int().min(1).max(50).nullable().optional(),
          discountAmount: z.number().int().min(1).nullable().optional(),
          validTo: z.coerce.date().nullable().optional(),
          usesLeft: z.number().int().min(1).nullable().optional(),
        })
        .refine((v) => v.discountPercent || v.discountAmount, 'Укажите процент или сумму'),
      req.body,
    );
    const code = body.code ?? (body.isCertificate ? 'GIFT-' : 'PROMO-') + randomToken(5).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
    if (await prisma.promoCode.findUnique({ where: { code } })) throw badRequest('Такой код уже существует');
    const promo = await prisma.promoCode.create({
      data: { ...body, code, usesLeft: body.isCertificate ? 1 : body.usesLeft },
    });
    await adminLog(req, 'promo.create', 'PromoCode', promo.id, body);
    res.status(201).json(promo);
  }),
);

adminContentRouter.patch(
  '/promocodes/:id',
  requirePerm('promo.edit'),
  ah(async (req, res) => {
    const body = parse(z.object({ isActive: z.boolean() }), req.body);
    const promo = await prisma.promoCode.update({ where: { id: req.params.id }, data: body });
    await adminLog(req, 'promo.update', 'PromoCode', promo.id, body);
    res.json(promo);
  }),
);
