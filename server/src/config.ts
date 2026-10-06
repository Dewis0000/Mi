import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().default('http://localhost:5173'),
  API_URL: z.string().default('http://localhost:4000'),
  DATABASE_URL: z.string(),
  JWT_ACCESS_SECRET: z.string().min(8),
  SIGNING_SECRET: z.string().min(8),

  TELEGRAM_GATEWAY_TOKEN: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  VK_GROUP_TOKEN: z.string().optional(),
  MAX_BOT_TOKEN: z.string().optional(),
  ADMIN_TELEGRAM_CHAT_ID: z.string().optional(),

  SMARTCAPTCHA_SERVER_KEY: z.string().optional(),

  PAYMENT_PROVIDER: z.enum(['mock', 'yookassa']).default('mock'),
  YOOKASSA_SHOP_ID: z.string().optional(),
  YOOKASSA_SECRET_KEY: z.string().optional(),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('ru-central1'),
  S3_BUCKET: z.string().default('quest-recordings'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),

  MEDIA_HLS_URL: z.string().default('http://localhost:8888'),
  /** Control API MediaMTX; если не задан — запись по сеансам не управляется */
  MEDIA_API_URL: z.string().optional(),
  INGEST_SECRET: z.string().default('change-me-ingest'),
});

// Пустые строки из .env считаем отсутствующими значениями
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
export const config = schema.parse(raw);
export const isDev = config.NODE_ENV !== 'production';

// в продакшене не стартуем с секретами-заглушками из .env.example
if (!isDev) {
  const weak = (['JWT_ACCESS_SECRET', 'SIGNING_SECRET', 'INGEST_SECRET'] as const).filter((k) => config[k].startsWith('change-me'));
  if (weak.length) throw new Error(`Задайте собственные значения: ${weak.join(', ')}`);
}
