/**
 * Начальные данные. Всегда: роли, квесты с расписанием и главный администратор.
 * С demo: true — ещё демо-сотрудники, клиент с историей, записи и промокоды.
 */
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_ROLES } from './lib/permissions.js';
import { buildGrid, dateKey } from './lib/slots.js';

const weekdays = [0, 1, 2, 3, 4, 5, 6];
const allWeek = (timeFrom: string, timeTo: string, breakMin = 20) =>
  weekdays.map((weekday) => ({ weekday, timeFrom, timeTo, breakMin }));

const quests = [
  {
    slug: 'cirk-urodov',
    title: 'Цирк уродов',
    shortDescription:
      'Шапито приехало в город ровно на одну ночь. Зрители, которые остались после представления, так и не вернулись домой.',
    description:
      'Ржавые клетки, запах опилок и грима, музыка шарманки, которая не замолкает ни на секунду. Директор цирка приглашает вас за кулисы — туда, где держат артистов, которых не показывают публике. У вас 70 минут, чтобы найти выход, пока клоун не закончил свой последний номер.\n\nАктёрский квест с контактом: актёры могут прикасаться к игрокам. Предусмотрено стоп-слово и «щадящий» режим по запросу.',
    photoUrl: '/images/circus.webp',
    fearLevel: 5,
    minPlayers: 2,
    maxPlayers: 5,
    durationMin: 70,
    minAge: 18,
    basePrice: 5500,
    peakExtra: 1500,
    roomNumber: 1,
    sortOrder: 1,
    tags: ['актёры', 'контакт', 'экстрим'],
    schedules: allWeek('12:00', '02:00', 20),
  },
  {
    slug: 'sklep',
    title: 'Склеп',
    shortDescription:
      'Экспедиция спустилась в фамильный склеп графов Орловых. Факелы гаснут, а за стеной кто-то скребётся.',
    description:
      'Каменные своды, полумрак и скрежет за стенами. Вы — участники археологической экспедиции, которая вскрыла древнее захоронение. Чтобы выбраться, придётся разгадать шифры на надгробиях и не потревожить того, кто спит в центральном саркофаге.\n\nКвест с элементами мистики, сложными механическими загадками и одним актёром.',
    photoUrl: '/images/crypt.webp',
    fearLevel: 4,
    minPlayers: 2,
    maxPlayers: 5,
    durationMin: 75,
    minAge: 14,
    basePrice: 5000,
    peakExtra: 1000,
    roomNumber: 2,
    sortOrder: 2,
    tags: ['мистика', 'механика'],
    schedules: allWeek('11:00', '01:00', 25),
  },
  {
    slug: 'vedmin-les',
    title: 'Ведьмин лес',
    shortDescription:
      'Туман сгущается, тропа петляет, а в старой избушке горит свет. Говорят, отсюда выходят не все.',
    description:
      'Вы заблудились в лесу, о котором в деревне говорят шёпотом. Живой туман, звуки леса со всех сторон и хижина, в которой кто-то варит зелье. Атмосферный квест для тех, кто хочет попробовать хоррор без перегибов: страшно, но не до слёз.\n\nПодходит для первого знакомства с жанром и семейных команд с подростками.',
    photoUrl: '/images/forest.webp',
    fearLevel: 3,
    minPlayers: 2,
    maxPlayers: 6,
    durationMin: 60,
    minAge: 12,
    basePrice: 4000,
    peakExtra: 1000,
    roomNumber: 3,
    sortOrder: 3,
    tags: ['атмосфера', 'для новичков'],
    schedules: allWeek('10:00', '23:00', 20),
  },
  {
    slug: 'pepel',
    title: 'Пепел',
    shortDescription:
      'Двадцать лет назад приют сгорел дотла. Сегодня ночью в его окнах снова видели огонь.',
    description:
      'Обугленные стены, детские рисунки и запах гари. Вы — пожарные-дознаватели, которые должны выяснить, что на самом деле случилось той ночью. Но чем ближе вы к правде, тем жарче становится вокруг.\n\nСюжетный хоррор с неожиданной развязкой, спецэффектами и одним актёром.',
    photoUrl: '/images/ashes.webp',
    fearLevel: 4,
    minPlayers: 3,
    maxPlayers: 6,
    durationMin: 60,
    minAge: 16,
    basePrice: 4800,
    peakExtra: 1200,
    roomNumber: 4,
    sortOrder: 4,
    tags: ['сюжет', 'спецэффекты'],
    schedules: allWeek('12:00', '00:30', 20),
  },
  {
    slug: 'bezdna',
    title: 'Бездна',
    shortDescription: 'Батискаф застрял на дне Марианской впадины. Кислорода — на час. Снаружи что-то движется.',
    description:
      'Новый квест в разработке: клаустрофобия, глубина и тишина, в которой слышно собственное сердце. Открытие — скоро.',
    photoUrl: '/images/abyss.webp',
    fearLevel: 2,
    minPlayers: 2,
    maxPlayers: 4,
    durationMin: 60,
    minAge: 10,
    basePrice: 3500,
    peakExtra: 800,
    roomNumber: 5,
    sortOrder: 5,
    isActive: false,
    tags: ['скоро'],
    schedules: allWeek('10:00', '22:00', 15),
  },
];

const day = 86_400_000;
const at = (daysFromNow: number, hh: number, mm = 0) => {
  const d = new Date(Date.now() + daysFromNow * day);
  d.setHours(hh, mm, 0, 0);
  return d;
};

/** Начало реального сеанса по сетке расписания: n-й сеанс дня (с конца, если n < 0) */
function slotAt(quest: { id: string } & Parameters<typeof buildGrid>[0], schedules: Parameters<typeof buildGrid>[1], daysFromNow: number, n: number) {
  const grid = buildGrid(quest, schedules, dateKey(new Date(Date.now() + daysFromNow * day)));
  return grid[(n + grid.length) % grid.length].start;
}

export async function seed(prisma: PrismaClient, { demo: withDemo }: { demo: boolean }) {
  console.log(withDemo ? 'Seeding (с демо-данными)…' : 'Seeding…');

  for (const role of DEFAULT_ROLES) {
    await prisma.role.upsert({ where: { key: role.key }, create: role, update: { name: role.name, permissions: role.permissions } });
  }
  const roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.key, r]));

  for (const { schedules, ...q } of quests) {
    const existing = await prisma.quest.findUnique({ where: { slug: q.slug } });
    if (existing) {
      await prisma.schedule.deleteMany({ where: { questId: existing.id } });
      await prisma.quest.update({ where: { id: existing.id }, data: { ...q, schedules: { create: schedules } } });
    } else {
      await prisma.quest.create({ data: { ...q, schedules: { create: schedules } } });
    }
  }
  const qs = Object.fromEntries((await prisma.quest.findMany({ include: { schedules: true } })).map((q) => [q.slug, q]));

  // Сотрудники
  const ownerPhone = process.env.SEED_OWNER_PHONE ?? '+79990000001';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'admin12345';
  if (!withDemo && (ownerPassword === 'admin12345' || ownerPassword.length < 10)) {
    throw new Error('Задайте SEED_OWNER_PASSWORD (не короче 10 символов) — пароль главного администратора');
  }
  const staff = [
    { phone: ownerPhone, name: withDemo ? 'Алексей (владелец)' : process.env.SEED_OWNER_NAME ?? 'Владелец', role: 'owner', password: ownerPassword },
    ...(withDemo
      ? [
          { phone: '+79990000011', name: 'Марина', role: 'deputy', password: 'deputy12345' },
          { phone: '+79990000012', name: 'Ольга', role: 'accountant', password: 'account12345' },
          { phone: '+79990000013', name: 'Денис', role: 'operator', password: 'operator12345' },
        ]
      : []),
  ];
  for (const s of staff) {
    const passwordHash = await bcrypt.hash(s.password, 10);
    await prisma.user.upsert({
      where: { phone: s.phone },
      create: { phone: s.phone, name: s.name, phoneVerified: true, passwordHash, roleId: roles[s.role].id },
      update: { roleId: roles[s.role].id, passwordHash },
    });
  }

  if (!withDemo) {
    console.log(`Готово. Главный админ: ${ownerPhone}`);
    return;
  }

  // Демо-клиент с историей посещений
  const demoPhone = '+79990000002';
  let demo = await prisma.user.findUnique({ where: { phone: demoPhone } });
  if (!demo) {
    demo = await prisma.user.create({
      data: {
        phone: demoPhone,
        name: 'Анна',
        phoneVerified: true,
        email: 'anna@example.com',
        passwordHash: await bcrypt.hash('demo12345', 10),
        points: 300,
        lastVisitAt: at(-20, 19),
      },
    });
    const past = [
      { quest: 'vedmin-les', start: slotAt(qs['vedmin-les'], qs['vedmin-les'].schedules, -120, 5), passed: true, time: 52 },
      { quest: 'sklep', start: slotAt(qs['sklep'], qs['sklep'].schedules, -60, 6), passed: false, time: 75 },
      { quest: 'cirk-urodov', start: slotAt(qs['cirk-urodov'], qs['cirk-urodov'].schedules, -20, 5), passed: true, time: 64 },
    ];
    for (const p of past) {
      const q = qs[p.quest];
      const b = await prisma.booking.create({
        data: {
          userId: demo!.id,
          questId: q.id,
          startAt: p.start,
          endAt: new Date(p.start.getTime() + q.durationMin * 60_000),
          playersCount: 4,
          ages: [24, 27],
          status: 'COMPLETED',
          basePrice: q.basePrice + q.peakExtra,
          finalPrice: q.basePrice + q.peakExtra,
          passed: p.passed,
          timeSpentMin: p.time,
          pointsAwarded: true,
        },
      });
      await prisma.pointsLog.create({
        data: { userId: demo.id, delta: 100, reason: 'VISIT', comment: `Квест «${q.title}»`, bookingId: b.id, createdAt: p.start },
      });
      // демо-видеозапись (заглушка файла)
      const fileKey = `recordings/room${q.roomNumber}/demo-${b.id}.mp4`;
      const file = path.resolve(process.env.STORAGE_LOCAL_DIR ?? './storage', fileKey);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, Buffer.alloc(1024 * 64));
      await prisma.recording.create({
        data: {
          bookingId: b.id,
          roomNumber: q.roomNumber,
          fileKey,
          durationSec: p.time * 60,
          sizeBytes: BigInt(1_450_000_000 + p.time * 10_000_000),
          recordedAt: p.start,
          price: 990,
          isPurchased: p.quest === 'cirk-urodov',
          purchasedAt: p.quest === 'cirk-urodov' ? at(-19, 12) : null,
          expiresAt: p.quest === 'cirk-urodov' ? at(11, 12) : null,
          deleteAfter: new Date(p.start.getTime() + 180 * day),
        },
      });
    }
    await prisma.user.update({ where: { id: demo.id }, data: { lastVisitAt: past[past.length - 1].start } });

    // будущая запись
    const q = qs['pepel'];
    const start = slotAt(q, q.schedules, 3, 6);
    await prisma.booking.create({
      data: {
        userId: demo.id,
        questId: q.id,
        startAt: start,
        endAt: new Date(start.getTime() + q.durationMin * 60_000),
        playersCount: 5,
        ages: [22, 31],
        status: 'CONFIRMED',
        basePrice: q.basePrice + q.peakExtra,
        discountPercent: 10,
        discountAmount: Math.round((q.basePrice + q.peakExtra) * 0.1),
        finalPrice: Math.round((q.basePrice + q.peakExtra) * 0.9),
        comment: 'День рождения у Кати 🎂',
      },
    });
  }

  // Немного «чужих» записей для календаря и отчётов
  const guestPhones = ['+79161112233', '+79035554433', '+79267778899'];
  const guestNames = ['Игорь', 'Светлана', 'Тимур'];
  for (let i = 0; i < guestPhones.length; i++) {
    const exists = await prisma.user.findUnique({ where: { phone: guestPhones[i] } });
    if (exists) continue;
    const u = await prisma.user.create({ data: { phone: guestPhones[i], name: guestNames[i], phoneVerified: true } });
    const list = Object.values(qs).filter((q) => q.isActive);
    for (let k = 0; k < 4; k++) {
      const q = list[(i + k) % list.length];
      const offset = (k - 2) * 2 + i;
      const start = slotAt(q, q.schedules, offset, 2 + ((i * 3 + k) % 5));
      const status = offset < 0 ? (k === 0 && i === 2 ? 'NO_SHOW' : 'COMPLETED') : k === 3 ? 'NEW' : 'CONFIRMED';
      const price = q.basePrice + (start.getHours() >= 17 ? q.peakExtra : 0);
      await prisma.booking.create({
        data: {
          userId: u.id,
          questId: q.id,
          startAt: start,
          endAt: new Date(start.getTime() + q.durationMin * 60_000),
          playersCount: q.minPlayers + 1,
          ages: [20 + i],
          status,
          source: k % 2 ? 'PHONE' : 'WEB',
          basePrice: price,
          finalPrice: price,
          pointsAwarded: status === 'COMPLETED',
        },
      });
    }
  }

  await prisma.promoCode.upsert({
    where: { code: 'STRAH10' },
    create: { code: 'STRAH10', discountPercent: 10, validTo: at(365, 0) },
    update: {},
  });
  await prisma.promoCode.upsert({
    where: { code: 'GIFT-DEMO' },
    create: { code: 'GIFT-DEMO', isCertificate: true, discountAmount: 3000, usesLeft: 1 },
    update: {},
  });

  console.log(`Готово. Главный админ: ${ownerPhone} / ${ownerPassword}; демо-клиент: ${demoPhone} / demo12345`);
}

