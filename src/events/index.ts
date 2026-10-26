import health from './health.json';
import family from './family.json';
import education from './education.json';
import work from './work.json';
import fortune from './fortune.json';
import tradition from './tradition.json';
import marriage from './marriage.json';
import migration from './migration.json';
import disaster from './disaster.json';
import conflict from './conflict.json';
import crime from './crime.json';
import death from './death.json';
import type { EventDefinition } from '../types';

interface EventFile {
  events: EventDefinition[];
  i18n: { ru: Record<string, string>; en: Record<string, string> };
}

const files = [
  health,
  family,
  education,
  work,
  fortune,
  tradition,
  marriage,
  migration,
  disaster,
  conflict,
  crime,
  death,
] as unknown as EventFile[];

export const allEvents: EventDefinition[] = files.flatMap((f) => f.events);

export const eventsI18n: { ru: Record<string, string>; en: Record<string, string> } = {
  ru: Object.assign({}, ...files.map((f) => f.i18n.ru)),
  en: Object.assign({}, ...files.map((f) => f.i18n.en)),
};

export const eventById = new Map<string, EventDefinition>(allEvents.map((e) => [e.id, e]));

export const eventsByCategory = new Map<string, EventDefinition[]>();
for (const e of allEvents) {
  const list = eventsByCategory.get(e.category) ?? [];
  list.push(e);
  eventsByCategory.set(e.category, list);
}
