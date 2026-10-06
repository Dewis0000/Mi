import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ah, badRequest, jsonSafe, notFound, parse } from '../../lib/http.js';
import { adminLog, requirePerm } from '../../middleware/auth.js';
import { attachRecording } from '../../services/recordings.js';
import { getSettings } from '../../services/settings.js';
import { deleteFile, signedDownloadUrl, uploadTmpDir } from '../../services/storage.js';

export const adminMediaRouter = Router();

adminMediaRouter.get(
  '/recordings',
  requirePerm('recordings.manage'),
  ah(async (req, res) => {
    const q = parse(z.object({ unbound: z.enum(['true']).optional(), room: z.coerce.number().optional() }), req.query);
    const items = await prisma.recording.findMany({
      where: { bookingId: q.unbound ? null : undefined, roomNumber: q.room },
      include: { booking: { include: { quest: { select: { title: true } }, user: { select: { name: true, phone: true } } } } },
      orderBy: { recordedAt: 'desc' },
      take: 200,
    });
    const settings = await getSettings();
    res.json({ items: jsonSafe(items), retentionDays: settings.recordings.retentionDays });
  }),
);

const upload = multer({ dest: uploadTmpDir, limits: { fileSize: 8 * 1024 ** 3 } });

/** Ручная загрузка записи (если автоматика не сработала) */
adminMediaRouter.post(
  '/recordings',
  requirePerm('recordings.manage'),
  upload.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw badRequest('Прикрепите видеофайл');
    const body = parse(
      z.object({
        room: z.coerce.number().int().min(1),
        recordedAt: z.coerce.date(),
        durationSec: z.coerce.number().int().min(1),
        bookingId: z.string().optional(),
      }),
      req.body,
    );
    const rec = await attachRecording({ ...body, bookingId: body.bookingId, file: req.file });
    await adminLog(req, 'recording.upload', 'Recording', rec.id, { room: body.room, bookingId: rec.bookingId });
    res.status(201).json(jsonSafe(rec));
  }),
);

/** Ручная привязка записи к заявке */
adminMediaRouter.patch(
  '/recordings/:id',
  requirePerm('recordings.manage'),
  ah(async (req, res) => {
    const body = parse(z.object({ bookingId: z.string().nullable().optional(), price: z.number().int().min(0).optional(), deleteAfter: z.coerce.date().nullable().optional() }), req.body);
    if (body.bookingId && !(await prisma.booking.findUnique({ where: { id: body.bookingId } }))) throw notFound('Заявка не найдена');
    const rec = await prisma.recording.update({ where: { id: req.params.id }, data: body });
    await adminLog(req, 'recording.update', 'Recording', rec.id, body);
    res.json(jsonSafe(rec));
  }),
);

adminMediaRouter.get(
  '/recordings/:id/download',
  requirePerm('recordings.manage'),
  ah(async (req, res) => {
    const rec = await prisma.recording.findUnique({ where: { id: req.params.id } });
    if (!rec) throw notFound();
    await adminLog(req, 'recording.download', 'Recording', rec.id);
    res.json({ url: await signedDownloadUrl(rec.fileKey, `room${rec.roomNumber}-${rec.recordedAt.toISOString().slice(0, 16)}.mp4`, 900) });
  }),
);

adminMediaRouter.delete(
  '/recordings/:id',
  requirePerm('recordings.manage'),
  ah(async (req, res) => {
    const rec = await prisma.recording.findUnique({ where: { id: req.params.id } });
    if (!rec) throw notFound();
    await deleteFile(rec.fileKey).catch(() => null);
    await prisma.recording.delete({ where: { id: rec.id } });
    await adminLog(req, 'recording.delete', 'Recording', rec.id, { fileKey: rec.fileKey });
    res.json({ ok: true });
  }),
);

adminMediaRouter.get(
  '/payments',
  requirePerm('payments.view'),
  ah(async (req, res) => {
    const q = parse(z.object({ page: z.coerce.number().int().min(1).default(1) }), req.query);
    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * 50,
        take: 50,
        include: { user: { select: { name: true, phone: true } } },
      }),
      prisma.payment.count(),
    ]);
    res.json({ items, total, page: q.page, pageSize: 50 });
  }),
);
