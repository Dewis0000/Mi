import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';
import { signUrlParams } from '../lib/crypto.js';

/**
 * Хранилище видеозаписей. Бакет приватный: скачать файл можно только
 * по подписанной временной ссылке.
 */
const s3 =
  config.STORAGE_DRIVER === 's3'
    ? new S3Client({
        endpoint: config.S3_ENDPOINT,
        region: config.S3_REGION,
        forcePathStyle: true,
        credentials: { accessKeyId: config.S3_ACCESS_KEY ?? '', secretAccessKey: config.S3_SECRET_KEY ?? '' },
      })
    : null;

export const localDir = path.resolve(config.STORAGE_LOCAL_DIR);

export function localPath(key: string) {
  const p = path.resolve(localDir, key);
  if (!p.startsWith(localDir + path.sep)) throw new Error('Bad key');
  return p;
}

/** Сохраняет файл с диска в хранилище потоково (видео бывают по несколько гигабайт) */
export async function putFileFromPath(key: string, filePath: string, contentType: string) {
  if (s3) {
    // multipart-загрузка: без ограничения 5 ГБ на один PUT и без чтения файла в память
    await new Upload({
      client: s3,
      params: { Bucket: config.S3_BUCKET, Key: key, Body: createReadStream(filePath), ContentType: contentType },
      partSize: 64 * 1024 * 1024,
    }).done();
    await fs.rm(filePath, { force: true });
    return;
  }
  const p = localPath(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  try {
    await fs.rename(filePath, p);
  } catch {
    // другой диск — копируем
    await fs.copyFile(filePath, p);
    await fs.rm(filePath, { force: true });
  }
}

export const uploadTmpDir = path.join(localDir, 'tmp');

export async function deleteFile(key: string) {
  if (s3) {
    await s3.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
    return;
  }
  await fs.rm(localPath(key), { force: true });
}

/** Временная ссылка на скачивание (по умолчанию — 1 час на конкретную загрузку) */
export async function signedDownloadUrl(key: string, filename: string, ttlSec = 3600) {
  if (s3) {
    return getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
      }),
      { expiresIn: ttlSec },
    );
  }
  const { exp, sig } = signUrlParams(key, new Date(Date.now() + ttlSec * 1000));
  const q = new URLSearchParams({ key, exp: String(exp), sig, name: filename });
  return `${config.API_URL}/api/files/download?${q}`;
}
