import type { Request, Response } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';

/** sitemap.xml с активными квестами */
export async function sitemap(_req: Request, res: Response) {
  const base = config.APP_URL.split(',')[0].replace(/\/$/, '');
  const quests = await prisma.quest.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } });
  const urls = [
    { loc: `${base}/`, priority: '1.0' },
    ...quests.map((q) => ({ loc: `${base}/quests/${q.slug}`, priority: '0.8', lastmod: q.updatedAt.toISOString().slice(0, 10) })),
    { loc: `${base}/privacy`, priority: '0.2' },
    { loc: `${base}/personal-data`, priority: '0.2' },
  ];
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls
        .map((u) => `  <url><loc>${u.loc}</loc>${'lastmod' in u ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`)
        .join('\n') +
      '\n</urlset>\n',
  );
}
