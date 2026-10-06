import { prisma } from '../db.js';

/** Настройки и тексты сайта, редактируемые из админки */
export const defaultSettings = {
  site: {
    name: 'Чёрный ход',
    tagline: 'Хоррор-квесты в реальности',
    heroTitle: 'Страх, который\nможно потрогать',
    heroText:
      'Авторские сюжеты, живые актёры, звук, от которого стынет кровь, и 60–75 минут, чтобы выбраться. Соберите команду — если осмелитесь.',
    aboutText:
      '«Чёрный ход» — сеть авторских хоррор-квестов. Мы строим декорации вручную, пишем сценарии вместе с театральными режиссёрами и работаем только с профессиональными актёрами. Безопасность — на первом месте: стоп-слово, видеонаблюдение и администратор на связи всё время игры.',
  },
  contacts: {
    address: 'Москва, ул. Бауманская, 13',
    addressNote: 'Вход со двора, железная дверь с красной лампой',
    lat: 55.772,
    lon: 37.6795,
    phone: '+7 (495) 000-13-13',
    email: 'hello@chernyhod.ru',
    hours: 'Ежедневно 10:00 – 02:00',
    telegram: 'https://t.me/chernyhod',
    vk: 'https://vk.com/chernyhod',
    max: 'https://max.ru/chernyhod',
  },
  booking: {
    /** Без оплаты или с онлайн-предоплатой */
    prepayMode: 'none' as 'none' | 'prepay',
    prepayPercent: 30,
    holdMinutes: 10,
    cancelHours: 24,
    /** Сколько дней вперёд можно записаться */
    horizonDays: 60,
  },
  loyalty: {
    pointsPerVisit: 100,
    tiers: [
      { from: 0, percent: 0 },
      { from: 100, percent: 5 },
      { from: 300, percent: 10 },
      { from: 600, percent: 15 },
      { from: 1000, percent: 20 },
    ],
    burnAfterMonths: 6,
    burnPercentPerMonth: 25,
  },
  recordings: {
    price: 990,
    linkDays: 30,
    retentionDays: 60,
  },
};

export type Settings = typeof defaultSettings;
export type SettingKey = keyof Settings;

let cache: { at: number; value: Settings } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < 10_000) return cache.value;
  const rows = await prisma.setting.findMany();
  const value = structuredClone(defaultSettings) as Settings;
  for (const row of rows) {
    if (row.key in value) {
      const k = row.key as SettingKey;
      (value as Record<string, unknown>)[k] = { ...value[k], ...(row.value as object) };
    }
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function setSetting<K extends SettingKey>(key: K, value: Partial<Settings[K]>) {
  const current = (await getSettings())[key];
  const merged = { ...current, ...value };
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: merged as object },
    update: { value: merged as object },
  });
  cache = null;
  return merged;
}
