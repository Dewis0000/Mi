/**
 * Точка входа для хостинга без доступа к консоли (например, Node.js-сайт в ispmanager):
 * применяет миграции, при пустой базе создаёт начальные данные и запускает сервер.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

if (process.env.SKIP_MIGRATIONS !== '1') {
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { stdio: 'inherit', env: process.env });
}

const { prisma } = await import('./db.js');
if ((await prisma.role.count()) === 0) {
  const { seed } = await import('./seed.js');
  await seed(prisma, { demo: process.env.SEED_DEMO === '1' });
}

await import('./index.js');
