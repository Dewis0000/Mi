// Офлайн-текстовый слой: резолвит event.*.title/body/choice.*.label из
// словаря i18n и собирает шаблонный эпилог жизни. Это последний рубеж —
// используется и напрямую (ИИ отключён), и как фолбэк, когда ответ ИИ
// отвергнут постфильтром или сеть отказала. Поэтому функции здесь никогда
// не бросают исключений.

import type { EventDefinition, Stats } from '../types';
import { eventsI18n } from '../events';
import { ruYearsWord } from '../i18n';

type Locale = 'ru' | 'en';

function otherLocale(locale: Locale): Locale {
  return locale === 'ru' ? 'en' : 'ru';
}

function lookupKey(key: string, locale: Locale): string | null {
  const dict = eventsI18n[locale];
  const value = dict ? dict[key] : undefined;
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return null;
}

/** Достаёт строку по ключу; при отсутствии — пробует другую локаль; иначе — заглушка. */
function resolveTextKey(key: string, locale: Locale, placeholder: string): string {
  const primary = lookupKey(key, locale);
  if (primary !== null) return primary;
  const fallback = lookupKey(key, otherLocale(locale));
  if (fallback !== null) return fallback;
  return placeholder;
}

export function offlineEventText(
  def: EventDefinition,
  locale: Locale,
): { title: string; body: string } {
  try {
    const title = resolveTextKey(
      def.titleKey,
      locale,
      locale === 'ru' ? 'Событие из жизни' : 'A life event',
    );
    const body = resolveTextKey(
      def.bodyKey,
      locale,
      locale === 'ru'
        ? 'Что-то произошло, но подробности утрачены.'
        : 'Something happened, but the details were lost.',
    );
    return { title, body };
  } catch {
    return locale === 'ru'
      ? { title: 'Событие из жизни', body: 'Что-то произошло, но подробности утрачены.' }
      : { title: 'A life event', body: 'Something happened, but the details were lost.' };
  }
}

export function offlineChoiceLabel(eventId: string, choiceId: string, locale: Locale): string {
  try {
    const key = `event.${eventId}.choice.${choiceId}.label`;
    return resolveTextKey(key, locale, locale === 'ru' ? 'Вариант' : 'Option');
  } catch {
    return locale === 'ru' ? 'Вариант' : 'Option';
  }
}

export interface EpilogueInput {
  countryName: string;
  sex: 'male' | 'female';
  ageAtDeath: number;
  causeOfDeathLabel: string;
  notableEventTitles: string[]; // несколько самых заметных заголовков из таймлайна
  finalStats: Stats;
}

// Небольшой детерминированный хэш строки — выбирает вариант фразы так, чтобы
// похожие жизни не звучали слово-в-слово одинаково, но результат оставался
// воспроизводимым (без Math.random()).
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length];
}

// Без "в <страна>": имена стран хранятся в именительном падеже и не
// склоняются (а для ~197 стран построить таблицу склонений — отдельная
// большая задача), поэтому название страны всегда ставится как
// самостоятельная метка, а не встраивается в падежную конструкцию.
const OPENERS_RU = [
  (c: string) => `Страна: ${c}. Жизнь подошла к концу.`,
  (c: string) => `${c}. Эта история теперь завершена.`,
  (c: string) => `Место: ${c}. Биография закрыта.`,
  (c: string) => `${c}. Пройденный путь окончен.`,
];

const OPENERS_EN = [
  (c: string) => `A life that began in ${c} has come to its end.`,
  (c: string) => `This story unfolded in ${c} and is now complete.`,
  (c: string) => `A biography lived out in ${c} is closed.`,
  (c: string) => `The path walked through ${c} has ended.`,
];

const CLOSERS_RU = [
  'Это была одна из восьми миллиардов параллельных жизней на этой планете.',
  'Ещё одна жизнь среди миллиардов, прожитых одновременно с вашей.',
  'Таких историй на Земле сейчас — миллиарды, каждая со своей тяжестью.',
  'Одна нить в необъятном полотне из восьми миллиардов судеб.',
];

const CLOSERS_EN = [
  'It was one of eight billion parallel lives on this planet.',
  'Another life among billions lived alongside your own.',
  'There are billions of such stories unfolding right now.',
  'One thread in the vast fabric of eight billion fates.',
];

const SEX_LABEL_RU: Record<'male' | 'female', string> = { male: 'мужчина', female: 'женщина' };
const SEX_LABEL_EN: Record<'male' | 'female', string> = { male: 'man', female: 'woman' };

/**
 * Шаблонный, не-ИИ эпилог: документальный, нейтральный тон, 150-200 слов.
 * Варианты вступления/заключения выбираются детерминированно по хэшу входных
 * данных, чтобы повторные эпилоги похожих жизней не читались слово в слово
 * одинаково.
 */
export function offlineEpilogue(input: EpilogueInput, locale: Locale): string {
  try {
    const seed = hashString(
      `${input.countryName}|${input.sex}|${input.ageAtDeath}|${input.causeOfDeathLabel}`,
    );
    const isRu = locale === 'ru';
    const opener = pick(isRu ? OPENERS_RU : OPENERS_EN, seed)(input.countryName);
    const closer = pick(isRu ? CLOSERS_RU : CLOSERS_EN, seed >> 2);
    const sexLabel = (isRu ? SEX_LABEL_RU : SEX_LABEL_EN)[input.sex];

    const notable = input.notableEventTitles.filter((t) => t.trim().length > 0).slice(0, 10);
    const notableText = notable.length > 0 ? notable.join('; ') : '';

    const stats = input.finalStats;

    const paragraphs: string[] = [];
    paragraphs.push(opener);

    if (isRu) {
      const livedVerb = input.sex === 'female' ? 'дожила' : 'дожил';
      paragraphs.push(
        `Персонаж, ${sexLabel}, ${livedVerb} до ${input.ageAtDeath} ${ruYearsWord(input.ageAtDeath)}. Причина смерти: ${input.causeOfDeathLabel}.`,
      );
      if (notableText) {
        paragraphs.push(`Среди событий, определивших эту жизнь: ${notableText}.`);
      }
      paragraphs.push(
        `К финалу состояние здоровья составляло ${stats.health} из 100, благополучие — ${stats.wealth}, образование — ${stats.education}, связи с близкими — ${stats.bonds}, общественное положение — ${stats.standing}.`,
      );
      paragraphs.push(
        `Это не история успеха или неудачи — лишь фиксация того, что произошло, без оценок и морали.`,
      );
    } else {
      paragraphs.push(
        `The character, a ${sexLabel}, lived to the age of ${input.ageAtDeath}. Cause of death: ${input.causeOfDeathLabel}.`,
      );
      if (notableText) {
        paragraphs.push(`Among the events that shaped this life: ${notableText}.`);
      }
      paragraphs.push(
        `By the end, health stood at ${stats.health} out of 100, wealth at ${stats.wealth}, education at ${stats.education}, bonds at ${stats.bonds}, and standing at ${stats.standing}.`,
      );
      paragraphs.push(
        `This is not a story of success or failure — only a record of what happened, without judgment.`,
      );
    }

    paragraphs.push(closer);

    return paragraphs.join(' ');
  } catch {
    return locale === 'ru'
      ? 'Эта жизнь завершилась. Подробности эпилога недоступны.'
      : 'This life has ended. Epilogue details are unavailable.';
  }
}
