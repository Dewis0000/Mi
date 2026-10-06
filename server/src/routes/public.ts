import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ah, notFound, parse } from '../lib/http.js';
import { dateKey, getSlots } from '../lib/slots.js';
import { optionalAuth } from '../middleware/auth.js';
import { getSettings } from '../services/settings.js';

export const publicRouter = Router();

export const questPublicSelect = {
  id: true,
  slug: true,
  title: true,
  shortDescription: true,
  description: true,
  photoUrl: true,
  fearLevel: true,
  minPlayers: true,
  maxPlayers: true,
  durationMin: true,
  minAge: true,
  basePrice: true,
  peakExtra: true,
  tags: true,
} as const;

/** Тексты, контакты и публичные параметры записи */
publicRouter.get(
  '/content',
  ah(async (_req, res) => {
    const s = await getSettings();
    res.json({
      site: s.site,
      contacts: s.contacts,
      booking: { prepayMode: s.booking.prepayMode, prepayPercent: s.booking.prepayPercent, cancelHours: s.booking.cancelHours, holdMinutes: s.booking.holdMinutes },
      loyalty: s.loyalty,
      recordings: { price: s.recordings.price, linkDays: s.recordings.linkDays },
    });
  }),
);

publicRouter.get(
  '/quests',
  ah(async (_req, res) => {
    const quests = await prisma.quest.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: questPublicSelect,
    });
    res.json(quests);
  }),
);

publicRouter.get(
  '/quests/:slug',
  ah(async (req, res) => {
    const quest = await prisma.quest.findFirst({
      where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }], isActive: true },
      select: questPublicSelect,
    });
    if (!quest) throw notFound('Квест не найден');
    res.json(quest);
  }),
);

/** Загрузка календаря: сколько свободных сеансов в каждый день месяца */
publicRouter.get(
  '/quests/:id/calendar',
  optionalAuth,
  ah(async (req, res) => {
    const { month } = parse(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }), req.query);
    const settings = await getSettings();
    const [y, m] = month.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today.getTime() + settings.booking.horizonDays * 86_400_000);
    const result: { date: string; free: number; total: number }[] = [];
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m - 1, d);
      const key = dateKey(date);
      if (date < today || date > horizon) {
        result.push({ date: key, free: 0, total: 0 });
        continue;
      }
      const slots = await getSlots(req.params.id, key, { userId: req.user?.id });
      result.push({ date: key, free: slots.filter((s) => s.available).length, total: slots.length });
    }
    res.json(result);
  }),
);

publicRouter.get(
  '/quests/:id/slots',
  optionalAuth,
  ah(async (req, res) => {
    const { date } = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query);
    const slots = await getSlots(req.params.id, date, { userId: req.user?.id });
    res.json(slots);
  }),
);
