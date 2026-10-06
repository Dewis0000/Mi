import { PrismaClient } from '@prisma/client';
import { seed } from '../src/seed.js';

// npm run db:seed — с демо-данными; SEED_DEMO=0 — только роли, квесты и владелец
const prisma = new PrismaClient();
seed(prisma, { demo: process.env.SEED_DEMO !== '0' })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
