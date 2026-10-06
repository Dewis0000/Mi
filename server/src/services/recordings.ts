import { prisma } from '../db.js';
import { getSettings } from './settings.js';
import { putFileFromPath } from './storage.js';

/**
 * Сохраняет запись и автоматически привязывает её к заявке
 * по номеру комнаты и времени сеанса.
 */
export async function attachRecording(opts: {
  room: number;
  recordedAt: Date;
  durationSec: number;
  sizeBytes?: number;
  fileKey?: string;
  file?: Express.Multer.File;
  bookingId?: string | null;
}) {
  const settings = await getSettings();
  let fileKey = opts.fileKey;
  let size = opts.sizeBytes ?? 0;
  if (opts.file) {
    fileKey = `recordings/room${opts.room}/${opts.recordedAt.toISOString().replace(/[:.]/g, '-')}.mp4`;
    size = opts.file.size;
    await putFileFromPath(fileKey, opts.file.path, opts.file.mimetype || 'video/mp4');
  }
  if (!fileKey) throw new Error('Не передан файл или fileKey');

  let bookingId = opts.bookingId ?? null;
  if (bookingId === null && opts.bookingId === undefined) {
    // ищем сеанс в этой комнате, пересекающийся по времени с записью
    const recEnd = new Date(opts.recordedAt.getTime() + opts.durationSec * 1000);
    const booking = await prisma.booking.findFirst({
      where: {
        quest: { roomNumber: opts.room },
        status: { in: ['CONFIRMED', 'COMPLETED', 'NEW'] },
        startAt: { lt: recEnd },
        endAt: { gt: opts.recordedAt },
      },
      orderBy: { startAt: 'asc' },
    });
    bookingId = booking?.id ?? null;
  }

  return prisma.recording.create({
    data: {
      bookingId,
      roomNumber: opts.room,
      fileKey,
      durationSec: opts.durationSec,
      sizeBytes: BigInt(size),
      recordedAt: opts.recordedAt,
      price: settings.recordings.price,
      deleteAfter: new Date(opts.recordedAt.getTime() + settings.recordings.retentionDays * 86_400_000),
    },
  });
}
