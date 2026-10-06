import { Router } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { ah, badRequest, forbidden, notFound } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { markPaid, verifyYookassaPayment } from '../services/payments.js';

export const paymentsRouter = Router();

paymentsRouter.get(
  '/:id',
  requireAuth,
  ah(async (req, res) => {
    const p = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!p) throw notFound();
    if (p.userId !== req.user!.id) throw forbidden();
    res.json(p);
  }),
);

/** Имитация успешной оплаты — работает только с провайдером mock */
paymentsRouter.post(
  '/:id/mock-confirm',
  requireAuth,
  ah(async (req, res) => {
    if (config.PAYMENT_PROVIDER !== 'mock') throw badRequest('Тестовая оплата отключена');
    const p = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!p) throw notFound();
    if (p.userId !== req.user!.id) throw forbidden();
    res.json(await markPaid(p.id));
  }),
);

/** Webhook ЮKassa: статус перепроверяется запросом к API, телу уведомления не доверяем */
paymentsRouter.post(
  '/webhook/yookassa',
  ah(async (req, res) => {
    const externalId = req.body?.object?.id;
    if (typeof externalId === 'string') {
      const remote = await verifyYookassaPayment(externalId);
      if (remote?.status === 'succeeded') {
        const local = await prisma.payment.findFirst({ where: { externalId } });
        if (local) await markPaid(local.id);
      } else if (remote?.status === 'canceled') {
        await prisma.payment.updateMany({ where: { externalId }, data: { status: 'CANCELED' } });
      }
    }
    res.json({ ok: true });
  }),
);
