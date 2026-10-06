import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ah, badRequest, forbidden, notFound, parse } from '../../lib/http.js';
import { phoneSchema } from '../../lib/phone.js';
import { PERMISSIONS } from '../../lib/permissions.js';
import { adminLog, hasPerm, requirePerm } from '../../middleware/auth.js';

export const adminUsersRouter = Router();

adminUsersRouter.get(
  '/users',
  requirePerm('users.view'),
  ah(async (req, res) => {
    const q = parse(
      z.object({ q: z.string().optional(), page: z.coerce.number().int().min(1).default(1), blocked: z.enum(['true', 'false']).optional(), staff: z.enum(['true']).optional() }),
      req.query,
    );
    const canSeeRoles = hasPerm(req.user, 'roles.manage');
    const where: Prisma.UserWhereInput = {};
    if (q.q) {
      const digits = q.q.replace(/\D/g, '');
      where.OR = [
        { name: { contains: q.q, mode: 'insensitive' } },
        { email: { contains: q.q, mode: 'insensitive' } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits.length >= 10 ? digits.slice(-10) : digits } }] : []),
      ];
    }
    if (q.blocked) where.blocked = q.blocked === 'true';
    if (q.staff && canSeeRoles) where.roleId = { not: null };
    const pageSize = 30;
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * pageSize,
        take: pageSize,
        include: { role: canSeeRoles, _count: { select: { bookings: true } } },
      }),
      prisma.user.count({ where }),
    ]);
    const noShows = await prisma.booking.groupBy({
      by: ['userId'],
      where: { userId: { in: items.map((u) => u.id) }, status: 'NO_SHOW' },
      _count: true,
    });
    res.json({
      total,
      page: q.page,
      pageSize,
      items: items.map((u) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        phoneVerified: u.phoneVerified,
        email: u.email,
        points: u.points,
        blocked: u.blocked,
        createdAt: u.createdAt,
        lastVisitAt: u.lastVisitAt,
        bookingsCount: u._count.bookings,
        noShows: noShows.find((n) => n.userId === u.id)?._count ?? 0,
        // роль видна только главному администратору
        role: canSeeRoles && 'role' in u && u.role ? { key: u.role.key, name: u.role.name } : undefined,
      })),
    });
  }),
);

adminUsersRouter.get(
  '/users/:id',
  requirePerm('users.view'),
  ah(async (req, res) => {
    const canSeeRoles = hasPerm(req.user, 'roles.manage');
    const u = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        role: canSeeRoles,
        bookings: { include: { quest: { select: { title: true } } }, orderBy: { startAt: 'desc' }, take: 50 },
        pointsLog: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!u) throw notFound();
    const { passwordHash: _ph, roleId: _r, ...rest } = u;
    res.json({ ...rest, role: canSeeRoles && u.role ? { key: u.role.key, name: u.role.name } : undefined });
  }),
);

/** Регистрация пользователя вручную */
adminUsersRouter.post(
  '/users',
  requirePerm('users.edit'),
  ah(async (req, res) => {
    const body = parse(
      z.object({ phone: phoneSchema, name: z.string().trim().min(1).max(60), email: z.string().email().optional().or(z.literal('')) }),
      req.body,
    );
    if (await prisma.user.findUnique({ where: { phone: body.phone } })) throw badRequest('Пользователь с таким номером уже есть');
    const user = await prisma.user.create({
      data: { phone: body.phone, name: body.name, email: body.email || null, phoneVerified: true },
    });
    await adminLog(req, 'user.create', 'User', user.id, body);
    res.status(201).json(user);
  }),
);

adminUsersRouter.patch(
  '/users/:id',
  requirePerm('users.edit'),
  ah(async (req, res) => {
    const body = parse(
      z.object({ name: z.string().trim().max(60).optional(), email: z.string().email().nullable().optional(), phone: phoneSchema.optional() }),
      req.body,
    );
    const user = await prisma.user.update({ where: { id: req.params.id }, data: body });
    await adminLog(req, 'user.update', 'User', user.id, body);
    res.json({ ok: true });
  }),
);

/** Ручное подтверждение номера телефона */
adminUsersRouter.post(
  '/users/:id/verify-phone',
  requirePerm('users.edit'),
  ah(async (req, res) => {
    await prisma.user.update({ where: { id: req.params.id }, data: { phoneVerified: true } });
    await adminLog(req, 'user.verifyPhone', 'User', req.params.id);
    res.json({ ok: true });
  }),
);

adminUsersRouter.post(
  '/users/:id/block',
  requirePerm('users.edit'),
  ah(async (req, res) => {
    const { blocked, reason } = parse(z.object({ blocked: z.boolean(), reason: z.string().max(300).optional() }), req.body);
    if (req.params.id === req.user!.id) throw badRequest('Нельзя заблокировать себя');
    await prisma.user.update({ where: { id: req.params.id }, data: { blocked } });
    if (blocked) await prisma.refreshToken.updateMany({ where: { userId: req.params.id }, data: { revoked: true } });
    await adminLog(req, blocked ? 'user.block' : 'user.unblock', 'User', req.params.id, { reason });
    res.json({ ok: true });
  }),
);

adminUsersRouter.post(
  '/users/:id/points',
  requirePerm('points.edit'),
  ah(async (req, res) => {
    const { delta, comment } = parse(z.object({ delta: z.number().int().min(-100000).max(100000), comment: z.string().trim().min(2).max(200) }), req.body);
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw notFound();
    const real = Math.max(delta, -user.points);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { points: { increment: real } } }),
      prisma.pointsLog.create({ data: { userId: user.id, delta: real, reason: 'ADMIN', comment } }),
    ]);
    await adminLog(req, 'user.points', 'User', user.id, { delta: real, comment });
    res.json({ ok: true, points: user.points + real });
  }),
);

/* ---------- Роли: только главный администратор ---------- */

adminUsersRouter.get(
  '/roles',
  requirePerm('roles.manage'),
  ah(async (_req, res) => {
    const roles = await prisma.role.findMany({ include: { users: { select: { id: true, name: true, phone: true } } } });
    res.json({ roles, permissions: PERMISSIONS });
  }),
);

adminUsersRouter.put(
  '/users/:id/role',
  requirePerm('roles.manage'),
  ah(async (req, res) => {
    const { roleKey } = parse(z.object({ roleKey: z.string().nullable() }), req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, include: { role: true } });
    if (!target) throw notFound();
    const role = roleKey ? await prisma.role.findUnique({ where: { key: roleKey } }) : null;
    if (roleKey && !role) throw badRequest('Роль не найдена');
    if (target.role?.key === 'owner' && roleKey !== 'owner') {
      const owners = await prisma.user.count({ where: { role: { key: 'owner' } } });
      if (owners <= 1) throw badRequest('Нельзя снять последнего главного администратора');
    }
    await prisma.user.update({ where: { id: target.id }, data: { roleId: role?.id ?? null } });
    await adminLog(req, 'user.role', 'User', target.id, { from: target.role?.key ?? null, to: roleKey });
    res.json({ ok: true });
  }),
);

adminUsersRouter.put(
  '/roles/:key',
  requirePerm('roles.manage'),
  ah(async (req, res) => {
    const { permissions } = parse(z.object({ permissions: z.array(z.string()) }), req.body);
    if (req.params.key === 'owner') throw forbidden('Права главного администратора не редактируются');
    const valid = permissions.filter((p) => p in PERMISSIONS && p !== 'roles.manage');
    const role = await prisma.role.update({ where: { key: req.params.key }, data: { permissions: valid } });
    await adminLog(req, 'role.update', 'Role', role.id, { permissions: valid });
    res.json(role);
  }),
);

adminUsersRouter.get(
  '/logs',
  requirePerm('logs.view'),
  ah(async (req, res) => {
    const { page } = parse(z.object({ page: z.coerce.number().int().min(1).default(1) }), req.query);
    const [items, total] = await Promise.all([
      prisma.adminLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 50,
        take: 50,
        include: { admin: { select: { name: true, phone: true } } },
      }),
      prisma.adminLog.count(),
    ]);
    res.json({ items, total, page, pageSize: 50 });
  }),
);

