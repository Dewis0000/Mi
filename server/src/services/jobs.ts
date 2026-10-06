import { config } from '../config.js';
import { prisma } from '../db.js';
import { addMonths } from '../lib/loyalty.js';
import { notifyUser, templates } from './notify.js';
import { getSettings } from './settings.js';
import { deleteFile } from './storage.js';

/** Напоминания за 24 часа и за 2 часа до начала */
export async function sendReminders() {
  const now = Date.now();
  for (const [hours, flag] of [
    [24, 'reminded24'],
    [2, 'reminded2'],
  ] as const) {
    const bookings = await prisma.booking.findMany({
      where: {
        status: { in: ['NEW', 'CONFIRMED'] },
        linkedFrom: { is: null },
        [flag]: false,
        startAt: { gt: new Date(now), lte: new Date(now + hours * 3_600_000) },
      },
      include: { user: true, quest: true },
    });
    for (const b of bookings) {
      // не шлём суточное напоминание, если запись создана меньше чем за сутки
      const skip = hours === 24 && b.startAt.getTime() - now < 3 * 3_600_000;
      if (b.user.notifyReminders && !skip) await notifyUser(b.user, templates.reminder({ questTitle: b.quest.title, startAt: b.startAt }, hours));
      await prisma.booking.update({ where: { id: b.id }, data: { [flag]: true } });
    }
  }
}

/** Сгорание баллов при долгом отсутствии посещений */
export async function burnPoints() {
  const { loyalty } = await getSettings();
  const now = new Date();
  const threshold = addMonths(now, -loyalty.burnAfterMonths);
  const users = await prisma.user.findMany({
    where: { points: { gt: 0 }, lastVisitAt: { lt: threshold } },
    select: { id: true, points: true, lastVisitAt: true },
  });
  for (const u of users) {
    const lastBurn = await prisma.pointsLog.findFirst({
      where: { userId: u.id, reason: 'BURN', createdAt: { gt: u.lastVisitAt! } },
      orderBy: { createdAt: 'desc' },
    });
    if (lastBurn && addMonths(lastBurn.createdAt, 1) > now) continue;
    const amount = Math.max(1, Math.ceil((u.points * loyalty.burnPercentPerMonth) / 100));
    await prisma.$transaction([
      prisma.user.update({ where: { id: u.id }, data: { points: { decrement: Math.min(amount, u.points) } } }),
      prisma.pointsLog.create({
        data: { userId: u.id, delta: -Math.min(amount, u.points), reason: 'BURN', comment: `Нет посещений более ${loyalty.burnAfterMonths} мес.` },
      }),
    ]);
  }
}

/** Предупреждение о скором сгорании (за 7 дней) */
export async function warnBurn() {
  const { loyalty } = await getSettings();
  const now = new Date();
  const from = addMonths(new Date(now.getTime() + 6 * 86_400_000), -loyalty.burnAfterMonths);
  const to = addMonths(new Date(now.getTime() + 7 * 86_400_000), -loyalty.burnAfterMonths);
  const users = await prisma.user.findMany({ where: { points: { gt: 0 }, lastVisitAt: { gte: from, lt: to } } });
  for (const u of users) await notifyUser(u, templates.pointsBurnWarning(u.points, addMonths(u.lastVisitAt!, loyalty.burnAfterMonths)));
}

/** Автоудаление видео по сроку хранения и чистка просроченных блокировок/кодов */
export async function cleanup() {
  const now = new Date();
  const expired = await prisma.recording.findMany({ where: { deleteAfter: { lt: now } } });
  for (const r of expired) {
    await deleteFile(r.fileKey).catch((e) => console.error('delete recording', e));
    await prisma.recording.delete({ where: { id: r.id } });
  }
  await prisma.slotHold.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.verificationCode.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 86_400_000) } } });
  await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } });
}

/**
 * Запись с камер строго на время сеанса: включаем запись пути roomN в MediaMTX,
 * пока в комнате идёт игра, и выключаем после. Закрытый файл MediaMTX отправит в /api/recordings/ingest.
 */
const recordingState = new Map<number, boolean>();

export async function syncRecording() {
  if (!config.MEDIA_API_URL) return;
  const now = new Date();
  const [quests, live] = await Promise.all([
    prisma.quest.findMany({ select: { roomNumber: true } }),
    prisma.booking.findMany({
      where: { status: { in: ['NEW', 'CONFIRMED'] }, startAt: { lte: now }, endAt: { gt: now } },
      select: { quest: { select: { roomNumber: true } } },
    }),
  ]);
  const active = new Set(live.map((b) => b.quest.roomNumber));
  const auth = 'Basic ' + Buffer.from(`camera:${config.INGEST_SECRET}`).toString('base64');
  for (const room of new Set(quests.map((q) => q.roomNumber))) {
    const want = active.has(room);
    if (recordingState.get(room) === want) continue;
    const res = await fetch(`${config.MEDIA_API_URL}/v3/config/paths/patch/room${room}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ record: want }),
    }).catch((e) => e as Error);
    if (res instanceof Response && res.ok) recordingState.set(room, want);
    else console.error(`syncRecording room${room}:`, res instanceof Response ? res.status : res.message);
  }
}

export function startJobs() {
  const safe = (name: string, fn: () => Promise<void>) => () => fn().catch((e) => console.error(`job ${name}`, e));
  const every = (ms: number, name: string, fn: () => Promise<void>) => {
    setTimeout(safe(name, fn), 5_000);
    setInterval(safe(name, fn), ms);
  };
  every(60_000, 'reminders', sendReminders);
  every(30_000, 'recording', syncRecording);
  every(60 * 60_000, 'cleanup', cleanup);
  every(24 * 60 * 60_000, 'burn', async () => {
    await warnBurn();
    await burnPoints();
  });
}
