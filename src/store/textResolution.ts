// Резолюция текста события из оффлайн-пула (раздел 2: игра полностью
// играбельна без ИИ-ключа). ИИ-резолюция подключается поверх этого слоя в
// aiOrchestration.ts — здесь всегда доступный, синхронный фолбэк.
import type { Choice, EventDefinition, LifeEvent, Stats } from '../types';
import type { Locale } from '../i18n';
import { eventText } from '../i18n';

export function buildOfflineLifeEvent(
  def: EventDefinition,
  index: number,
  year: number,
  age: number,
  locale: Locale,
  choice?: Choice,
  resolvedBy?: 'player' | 'timeout',
): LifeEvent {
  const effects: Partial<Stats> = choice ? choice.effects : def.effects ?? {};
  return {
    id: `evt_${index}_${def.id}`,
    defId: def.id,
    year,
    age,
    category: def.category,
    severity: def.severity,
    title: eventText(locale, 'title', def.id),
    body: eventText(locale, 'body', def.id),
    source: 'offline',
    choices: def.choices,
    resolvedBy,
    chosenId: choice?.id,
    effects,
  };
}
