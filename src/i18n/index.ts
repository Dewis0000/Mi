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
