// Один игровой год — один тик (раздел 8, «Тик»). Строго по порядку:
// обновление возраста → бросок смертности → если выжил, бросок событий →
// применение эффектов. Текст (оффлайн или ИИ) резолвится выше, в слое
// оркестрации — этот модуль ничего не знает про текст и про React.

import type { CauseOfDeath, Character, Choice, Country, EventDefinition, Region } from '../types';
import { annualMortality, pickCauseOfDeath, rollDeath } from './mortality';
import { availableChoices, isChoiceEvent, selectEventsForTick } from './events';
import { applyAmbient, applyChoice, pruneExpiredModifiers } from './effects';
import type { RngFn } from './rng';

export interface FiredAmbient {
  def: EventDefinition;
}

export interface PendingChoice {
  def: EventDefinition;
  choices: Choice[];
}

export interface TickResult {
  character: Character;
  died: boolean;
  causeOfDeath: CauseOfDeath | null;
  qx: number;
  fired: FiredAmbient[];
  pendingChoice: PendingChoice | null;
}

export function runYearTick(
  character: Character,
  country: Country,
  region: Region | null,
  catalog: readonly EventDefinition[],
  firedOnceIds: ReadonlySet<string>,
  rng: RngFn,
): TickResult {
  let char: Character = { ...character, ageYears: character.ageYears + 1 };
  char = pruneExpiredModifiers(char);

  const qx = annualMortality(char, country, region);
  if (rollDeath(qx, rng)) {
    const cause = pickCauseOfDeath(char.ageYears, char.sex, country, rng);
    return {
      character: { ...char, alive: false },
      died: true,
      causeOfDeath: cause,
      qx,
      fired: [],
      pendingChoice: null,
    };
  }

  const picked = selectEventsForTick(
    { character: char, country, region, firedOnceIds },
    catalog,
    rng,
  );

  const fired: FiredAmbient[] = [];
  let pendingChoice: PendingChoice | null = null;

  for (const def of picked) {
    if (def.choices) {
      const avail = availableChoices(def, char, country);
      if (avail.length === 0) continue; // развилка без доступных вариантов — такого быть не должно, пропускаем защитно
      if (!pendingChoice && isChoiceEvent(def, avail)) {
        pendingChoice = { def, choices: avail };
        continue;
      }
      // Событие с choices, но не ставшее развилкой (одна развилка в тик уже занята,
      // либо доступен только 1 вариант и severity не major) — решается само.
      const choice = avail[Math.floor(rng() * avail.length)];
      char = applyChoice(char, def.id, choice);
      fired.push({ def });
    } else {
      char = applyAmbient(char, def);
      fired.push({ def });
    }
  }

  return { character: char, died: false, causeOfDeath: null, qx, fired, pendingChoice };
}

/** Применить выбор игрока (или таймаут) на развилке к персонажу. */
export function resolvePendingChoice(character: Character, pending: PendingChoice, choice: Choice): Character {
  return applyChoice(character, pending.def.id, choice);
}
