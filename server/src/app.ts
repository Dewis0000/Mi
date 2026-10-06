import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
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
  app.use(errorHandler);
  return app;
}
