import { Router } from 'express';
import { serializeUser } from '../../lib/serialize.js';
import { forbidden } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { adminBookingsRouter } from './bookings.js';
import { adminContentRouter } from './content.js';
import { adminMediaRouter } from './media.js';
import { adminReportsRouter } from './reports.js';
import { adminUsersRouter } from './users.js';

export const adminRouter = Router();

// Все роуты админки — только для сотрудников с ролью
adminRouter.use(requireAuth, (req, _res, next) => (req.user?.role?.permissions.length ? next() : next(forbidden())));

adminRouter.get('/me', (req, res) => res.json(serializeUser(req.user!)));
adminRouter.use(adminBookingsRouter, adminUsersRouter, adminContentRouter, adminMediaRouter, adminReportsRouter);
