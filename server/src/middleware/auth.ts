import type { NextFunction, Request, Response } from 'express';
import type { Role, User } from '@prisma/client';
import { prisma } from '../db.js';
import { HttpError, forbidden } from '../lib/http.js';
import { verifyAccess } from '../lib/jwt.js';
import type { Permission } from '../lib/permissions.js';

export type AuthedUser = User & { role: Role | null };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

async function loadUser(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const payload = verifyAccess(header.slice(7));
  if (!payload) return null;
  return prisma.user.findUnique({ where: { id: payload.sub }, include: { role: true } });
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await loadUser(req);
    if (user && !user.blocked) req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await loadUser(req);
    if (!user) return next(new HttpError(401, 'Требуется авторизация', 'UNAUTHORIZED'));
    if (user.blocked) return next(new HttpError(403, 'Аккаунт заблокирован. Свяжитесь с администратором.', 'BLOCKED'));
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

export const hasPerm = (user: AuthedUser | undefined, perm: Permission) =>
  !!user?.role?.permissions.includes(perm);

/** Проверка прав на бэкенде — админ-роуты защищены здесь, а не только во фронтенде */
export const requirePerm =
  (...perms: Permission[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user?.role) return next(forbidden());
    if (!perms.every((p) => hasPerm(req.user, p))) return next(forbidden());
    next();
  };

/** Журнал действий администраторов */
export function adminLog(req: Request, action: string, entity: string, entityId?: string | null, details?: unknown) {
  if (!req.user) return Promise.resolve();
  return prisma.adminLog
    .create({
      data: {
        adminId: req.user.id,
        action,
        entity,
        entityId: entityId ?? null,
        details: details === undefined ? undefined : JSON.parse(JSON.stringify(details)),
      },
    })
    .catch((e) => console.error('adminLog failed', e));
}
