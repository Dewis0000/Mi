import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, code?: string, extra?: Record<string, unknown>) =>
  new HttpError(400, msg, code, extra);
export const notFound = (msg = 'Не найдено') => new HttpError(404, msg, 'NOT_FOUND');
export const forbidden = (msg = 'Недостаточно прав') => new HttpError(403, msg, 'FORBIDDEN');

/** Оборачивает async-обработчик, пробрасывая ошибки в express */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Серверная валидация входящих данных через zod */
export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Некорректные данные',
      code: 'VALIDATION',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
  }
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}

/** JSON.stringify не умеет BigInt — приводим к number */
export function jsonSafe<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
}
