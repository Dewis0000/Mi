import { Router } from 'express';
import fs from 'node:fs';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { safeEqual, verifyUrlParams } from '../lib/crypto.js';
import { HttpError, ah, badRequest, forbidden, notFound, parse } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { createPayment } from '../services/payments.js';
import { attachRecording } from '../services/recordings.js';
import { getSettings } from '../services/settings.js';
import { localPath, signedDownloadUrl, uploadTmpDir } from '../services/storage.js';

export const recordingsRouter = Router();

async function ownRecording(userId: string, id: string) {
  const rec = await prisma.recording.findUnique({ where: { id }, include: { booking: { include: { quest: true } } } });
  if (!rec?.booking) throw notFound('Запись не найдена');
  // запись второго сеанса двойной аренды тоже принадлежит владельцу
  if (rec.booking.userId !== userId) throw forbidden();
  return rec;
}

recordingsRouter.post(
  '/:id/purchase',
  requireAuth,
  ah(async (req, res) => {
    const rec = await ownRecording(req.user!.id, req.params.id);
    if (rec.isPurchased) throw badRequest('Запись уже куплена');
    const settings = await getSettings();
    const payment = await createPayment({
      userId: req.user!.id,
      purpose: 'RECORDING',
      entityId: rec.id,
      amount: rec.price || settings.recordings.price,
      description: `Видеозапись прохождения «${rec.booking!.quest.title}»`,
      returnPath: '/profile/videos',
    });
    res.json(payment);
  }),
);

recordingsRouter.get(
  '/:id/download',
  requireAuth,
  ah(async (req, res) => {
    const rec = await ownRecording(req.user!.id, req.params.id);
    if (!rec.isPurchased) throw new HttpError(402, 'Запись не оплачена', 'NOT_PAID');
    if (!rec.expiresAt || rec.expiresAt < new Date()) throw new HttpError(410, 'Срок действия ссылки истёк', 'EXPIRED');
    const date = rec.recordedAt.toISOString().slice(0, 10);
    const url = await signedDownloadUrl(rec.fileKey, `${rec.booking!.quest.slug}-${date}.mp4`);
    res.json({ url, expiresAt: rec.expiresAt });
  }),
);

/**
 * Приём записи с камер по окончании сеанса (вызывает медиасервер).
 * Принимает либо файл (multipart), либо ключ уже загруженного в S3 объекта.
 */
const upload = multer({ dest: uploadTmpDir, limits: { fileSize: 8 * 1024 ** 3 } });

recordingsRouter.post(
  '/ingest',
  (req, _res, next) => {
    const secret = req.header('x-ingest-secret') ?? '';
    if (!safeEqual(secret, config.INGEST_SECRET)) return next(forbidden('Неверный ключ'));
    next();
  },
  upload.single('file'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        room: z.coerce.number().int().min(1),
        recordedAt: z.coerce.date(),
        durationSec: z.coerce.number().int().min(1),
        sizeBytes: z.coerce.number().int().optional(),
        fileKey: z.string().optional(),
      }),
      req.body,
    );
    const rec = await attachRecording({ ...body, file: req.file });
    res.status(201).json({ id: rec.id, bookingId: rec.bookingId });
  }),
);

/** Отдача файла по подписанной временной ссылке (локальное хранилище) */
export const filesRouter = Router();
filesRouter.get('/download', (req, res, next) => {
  const key = String(req.query.key ?? '');
  const exp = Number(req.query.exp);
  const sig = String(req.query.sig ?? '');
  if (!verifyUrlParams(key, exp, sig)) return next(new HttpError(403, 'Ссылка недействительна или устарела'));
  let p: string;
  try {
    p = localPath(key);
  } catch {
    return next(notFound());
  }
  if (!fs.existsSync(p)) return next(notFound('Файл не найден'));
  res.download(p, String(req.query.name ?? 'video.mp4'));
});
