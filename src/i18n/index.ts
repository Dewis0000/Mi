import ru from './ru';
import en from './en';
import { eventsI18n } from '../events';

export type Locale = 'ru' | 'en';

const dictionaries: Record<Locale, Record<string, string>> = {
  ru: { ...ru, ...eventsI18n.ru },
  en: { ...en, ...eventsI18n.en },
};

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const dict = dictionaries[locale] ?? dictionaries.ru;
  let text = dict[key] ?? dictionaries.ru[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export function eventText(
  locale: Locale,
  kind: 'title' | 'body',
  eventId: string,
): string {
  return translate(locale, `event.${eventId}.${kind}`);
}

export function choiceLabel(locale: Locale, eventId: string, choiceId: string): string {
  return translate(locale, `event.${eventId}.choice.${choiceId}.label`);
}

export function countryName(locale: Locale, name: Record<string, string>): string {
  return name[locale] ?? name.ru ?? name.en ?? Object.values(name)[0] ?? '?';
}

/** "год"/"года"/"лет" по стандартным правилам русского склонения числительных. */
export function ruYearsWord(n: number): string {
  const abs = Math.abs(Math.round(n));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'лет';
  if (mod10 === 1) return 'год';
  if (mod10 >= 2 && mod10 <= 4) return 'года';
  return 'лет';
}
