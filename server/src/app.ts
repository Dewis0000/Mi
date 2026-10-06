import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { errorHandler } from './lib/http.js';
import { adminRouter } from './routes/admin/index.js';
import { authRouter } from './routes/auth.js';
import { bookingsRouter } from './routes/bookings.js';
import { paymentsRouter } from './routes/payments.js';
import { profileRouter } from './routes/profile.js';
import { publicRouter } from './routes/public.js';
import { filesRouter, recordingsRouter } from './routes/recordings.js';
import { streamsRouter } from './routes/streams.js';
import { telegramRouter } from './routes/telegram.js';
import { localDir } from './services/storage.js';
import { sitemap } from './routes/seo.js';

/**
 * Если рядом лежит собранный фронтенд (WEB_DIST или ./public), API раздаёт его сам —
 * так сайт целиком работает одним процессом, например как Node.js-сайт в ispmanager.
 * Главная — пререндеренный index.html, остальные пути SPA — index.spa.html (если есть).
 */
function serveFrontend(app: express.Express) {
  const dir = path.resolve(process.env.WEB_DIST ?? 'public');
  const index = path.join(dir, 'index.html');
  if (!fs.existsSync(index)) return;
  const spa = fs.existsSync(path.join(dir, 'index.spa.html')) ? path.join(dir, 'index.spa.html') : index;
  app.use(
    express.static(dir, {
      index: false,
      setHeaders: (res, file) => {
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  app.get('/', (_req, res) => res.sendFile(index));
  app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => res.sendFile(spa));
  console.log(`Фронтенд: ${dir}`);
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  // CSP рассчитан и на раздачу фронтенда этим же процессом: шрифты Google, карта Яндекса,
  // SmartCaptcha и HLS-поток трансляций с медиасервера
  const hls = new URL(config.MEDIA_HLS_URL).origin;
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://smartcaptcha.yandexcloud.net'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: ["'self'", hls, 'https://smartcaptcha.yandexcloud.net'],
          mediaSrc: ["'self'", 'blob:', hls],
          workerSrc: ["'self'", 'blob:'],
          frameSrc: ['https://yandex.ru', 'https://smartcaptcha.yandexcloud.net'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'self'"],
          formAction: ["'self'"],
        },
      },
    }),
  );
  app.use(cors({ origin: config.APP_URL.split(','), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // общий лимит запросов и более строгий — на авторизацию
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/auth', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api', publicRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/recordings', recordingsRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/streams', streamsRouter);
  app.use('/api/telegram', telegramRouter);
  app.use('/api/admin', adminRouter);
  app.use('/uploads', express.static(path.join(localDir, 'uploads'), { maxAge: '30d' }));

  app.get('/sitemap.xml', sitemap);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Не найдено' }));
  serveFrontend(app);
  app.use(errorHandler);
  return app;
}
