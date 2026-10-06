import { Router } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { hmac, randomToken, safeEqual } from '../lib/crypto.js';
import { ah, badRequest, forbidden, notFound } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * Онлайн-трансляция с камер комнаты. Поток отдаёт MediaMTX (HLS),
 * а доступ к нему проверяется через /api/streams/mediamtx-auth:
 * токен действителен только пока идёт сеанс, после окончания поток закрывается.
 */
export const streamsRouter = Router();

type LiveBooking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;

function loadBooking(id: string) {
  return prisma.booking.findUnique({
    where: { id },
    include: { quest: { select: { title: true, roomNumber: true, photoUrl: true } }, linkedBooking: true },
  });
}

const sessionEnd = (b: LiveBooking) => b.linkedBooking?.endAt ?? b.endAt;

function streamToken(bookingId: string, exp: number) {
  return `${bookingId}.${exp}.${hmac(`stream:${bookingId}:${exp}`)}`;
}

function parseStreamToken(token: string) {
  const [bookingId, expStr, sig] = token.split('.');
  const exp = Number(expStr);
  if (!bookingId || !exp || !sig) return null;
  if (!safeEqual(sig, hmac(`stream:${bookingId}:${exp}`))) return null;
  if (exp * 1000 < Date.now()) return null;
  return { bookingId, exp };
}

function describe(b: LiveBooking) {
  const now = new Date();
  const end = sessionEnd(b);
  const live = ['NEW', 'CONFIRMED'].includes(b.status) && b.startAt <= now && end > now;
  const exp = Math.floor(end.getTime() / 1000);
  return {
    bookingId: b.id,
    quest: b.quest,
    startAt: b.startAt,
    endAt: end,
    status: live ? 'live' : now < b.startAt ? 'upcoming' : 'ended',
    hlsUrl: live ? `${config.MEDIA_HLS_URL}/room${b.quest.roomNumber}/index.m3u8` : null,
    token: live ? streamToken(b.id, exp) : null,
  };
}

streamsRouter.get(
  '/booking/:id',
  requireAuth,
  ah(async (req, res) => {
    const b = await loadBooking(req.params.id);
    if (!b) throw notFound();
    if (b.userId !== req.user!.id) throw forbidden();
    res.json(describe(b));
  }),
);

/** Временная ссылка для друзей и родственников — действует до конца сеанса */
streamsRouter.post(
  '/booking/:id/invite',
  requireAuth,
  ah(async (req, res) => {
    const b = await loadBooking(req.params.id);
    if (!b) throw notFound();
    if (b.userId !== req.user!.id) throw forbidden();
    const end = sessionEnd(b);
    if (end < new Date() || !['NEW', 'CONFIRMED'].includes(b.status)) throw badRequest('Сеанс уже завершён');
    const invite = await prisma.streamInvite.create({ data: { bookingId: b.id, token: randomToken(24), expiresAt: end } });
    res.json({ url: `${config.APP_URL}/watch/${invite.token}`, expiresAt: invite.expiresAt });
  }),
);

streamsRouter.get(
  '/invite/:token',
  ah(async (req, res) => {
    const invite = await prisma.streamInvite.findUnique({ where: { token: req.params.token } });
    if (!invite || invite.expiresAt < new Date()) throw notFound('Ссылка недействительна или трансляция завершена');
    const b = await loadBooking(invite.bookingId);
    if (!b) throw notFound();
    res.json(describe(b));
  }),
);

/** Внешняя HTTP-авторизация MediaMTX (authMethod: http) */
streamsRouter.post('/mediamtx-auth', (req, res) => {
  const { action, path, query, user, password } = req.body ?? {};
  // публикация потока и Control API — только камеры/сервер с секретом
  if (action === 'publish' || action === 'api') {
    return user === 'camera' && typeof password === 'string' && safeEqual(password, config.INGEST_SECRET)
      ? res.sendStatus(200)
      : res.sendStatus(401);
  }
  if (action !== 'read' && action !== 'playback') return res.sendStatus(401);
  const token = new URLSearchParams(String(query ?? '')).get('token') ?? '';
  const parsed = parseStreamToken(token);
  if (!parsed) return res.sendStatus(401);
  prisma.booking
    .findUnique({ where: { id: parsed.bookingId }, include: { quest: true, linkedBooking: true } })
    .then((b) => {
      const ok =
        b &&
        String(path) === `room${b.quest.roomNumber}` &&
        ['NEW', 'CONFIRMED'].includes(b.status) &&
        b.startAt <= new Date() &&
        (b.linkedBooking?.endAt ?? b.endAt) > new Date();
      res.sendStatus(ok ? 200 : 401);
    })
    .catch(() => res.sendStatus(500));
});
