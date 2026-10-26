// Короткие, токен-эффективные системные промпты на русском языке.
// Единый блок запретов зашит один раз и переиспользуется всеми тремя
// билдерами — и ради экономии токенов, и чтобы правила не расходились.

import type { Stats } from '../types';

type Locale = 'ru' | 'en';

// Общий блок жёстких запретов контента, встраиваемый во все промпты.
// Это не юридический текст — просто ясно сформулированная суть ограничений
// из спецификации игры, и явная формулировка роли ИИ как рассказчика, а не
// автора решений.
const CONTENT_BANS_RU = `Жёсткие правила:
- Ты только описываешь словами уже решённое событие и эффекты, ты не придумываешь, что произошло, не меняешь эффекты, не бросаешь кости.
- Если персонажу меньше 18 лет: никакого романтического, телесного или сексуального контента, даже намёками.
- Никаких графических описаний насилия, травм, крови или процесса умирания — факт события называй нейтрально, без детализации.
- Никаких описаний конкретных способов самоповреждения или суицида.
- Никаких уничижительных обобщений о народах, религиях или странах.
- Никаких реальных живых людей.
- Сухой документальный тон, без оценок и морали.`;

function localeInstruction(locale: Locale): string {
  return locale === 'ru'
    ? 'Ответ должен быть на русском языке.'
    : 'Respond in English.';
}

export interface EventPromptInput {
  character: {
    sex: 'male' | 'female';
    age: number;
    countryName: string;
    incomeTier: string;
    traitLabels: string[];
  };
  recentEventTitles: string[]; // последние до 3 заголовков из таймлайна
  firedEvent: {
    category: string;
    severity: string;
    offlineTitle: string;
    offlineBody: string;
  };
  locale: Locale;
}

/**
 * Промпт для озвучки уже произошедшего события.
 * Ожидаемая температура генерации: 0.9 (задаётся вызывающим кодом в client.ts,
 * здесь только документируем намерение).
 * Выход — строгий JSON {"title": string, "body": string}, title — короткая
 * фраза, body — 2-4 предложения.
 */
export function buildEventPrompt(input: EventPromptInput): { system: string; user: string } {
  const { character, recentEventTitles, firedEvent, locale } = input;
  const system = `Ты — рассказчик в симуляторе одной случайной человеческой жизни. ${CONTENT_BANS_RU}
Формат ответа: строго JSON без пояснений вокруг — {"title": string, "body": string}. title — короткая фраза (заголовок события), body — 2-4 предложения, сухой документальный тон. ${localeInstruction(locale)}`;

  const traits = character.traitLabels.length > 0 ? character.traitLabels.join(', ') : '—';
  const recent = recentEventTitles.length > 0 ? recentEventTitles.join(' → ') : '—';

  const user = `Персонаж: ${character.sex === 'male' ? 'мужчина' : 'женщина'}, ${character.age} лет, страна: ${character.countryName}, уровень дохода: ${character.incomeTier}, черты: ${traits}.
Недавние события: ${recent}.
Только что произошло (категория: ${firedEvent.category}, тяжесть: ${firedEvent.severity}). Фактическое описание того, что механически случилось: "${firedEvent.offlineTitle}" — ${firedEvent.offlineBody}
Перепиши это как заголовок и 2-4 предложения художественного, но фактологически точного текста, не меняя сути произошедшего.`;

  return { system, user };
}

export interface ChoicePromptInput {
  offlineTitle: string;
  offlineBody: string;
  choices: Array<{
    id: string;
    riskLabel: string;
    effectDirection: string; // например "здоровье вверх, благополучие вниз"
  }>;
  locale: Locale;
  // Контекст для постфильтра безопасности в client.ts (не используется
  // напрямую в тексте промпта, но нужен вызывающему коду).
  characterAge: number;
  category: string;
}

/**
 * Промпт для озвучки уже существующих вариантов выбора — просит ТОЛЬКО
 * человеческую формулировку для каждого id, не новые варианты и не эффекты.
 * Выход — строгий JSON {"labels": {"<choiceId>": string, ...}}.
 */
export function buildChoicePrompt(input: ChoicePromptInput): { system: string; user: string } {
  const { offlineTitle, offlineBody, choices, locale } = input;
  const system = `Ты — рассказчик в симуляторе одной случайной человеческой жизни. Тебе дают уже решённые варианты выбора (их id и эффекты зафиксированы движком) — твоя единственная задача: придумать короткую человеческую формулировку текста кнопки для каждого id, не меняя сути варианта. ${CONTENT_BANS_RU}
Формат ответа: строго JSON без пояснений вокруг — {"labels": {"<choiceId>": string, ...}}, каждая формулировка — короткая фраза (как текст на кнопке). ${localeInstruction(locale)}`;

  const choiceLines = choices
    .map((c) => `- id="${c.id}", риск: ${c.riskLabel}, эффект: ${c.effectDirection}`)
    .join('\n');

  const user = `Событие: "${offlineTitle}" — ${offlineBody}
Варианты выбора (не меняй id, не добавляй новые варианты):
${choiceLines}
Дай короткую формулировку для каждого id.`;

  return { system, user };
}

export interface EpiloguePromptInput {
  countryName: string;
  sex: 'male' | 'female';
  ageAtDeath: number;
  causeOfDeathLabel: string;
  keyEvents: Array<{ title: string; category: string }>; // 8-12 ключевых событий
  finalStats: Stats;
  locale: Locale;
}

/**
 * Промпт для финального эпилога жизни. Просит 150-200 слов, документальный
 * тон, без оценок/морали. Выход — строгий JSON {"text": string}.
 */
export function buildEpiloguePrompt(input: EpiloguePromptInput): { system: string; user: string } {
  const { countryName, sex, ageAtDeath, causeOfDeathLabel, keyEvents, finalStats, locale } = input;
  const system = `Ты — рассказчик в симуляторе одной случайной человеческой жизни. Напиши итоговый эпилог уже прожитой и завершённой жизни по приведённым фактам. ${CONTENT_BANS_RU}
Не выставляй оценок и не используй морализаторский тон, не присваивай жизни "успех" или "неудачу".
Формат ответа: строго JSON без пояснений вокруг — {"text": string}, объём текста — 150-200 слов. ${localeInstruction(locale)}`;

  const eventsList = keyEvents.map((e) => `${e.title} (${e.category})`).join('; ') || '—';

  const user = `Страна: ${countryName}. Пол: ${sex === 'male' ? 'мужчина' : 'женщина'}. Возраст смерти: ${ageAtDeath}. Причина смерти: ${causeOfDeathLabel}.
Ключевые события жизни: ${eventsList}.
Итоговые показатели: здоровье ${finalStats.health}, благополучие ${finalStats.wealth}, образование ${finalStats.education}, связи ${finalStats.bonds}, положение в обществе ${finalStats.standing}.
Напиши документальный эпилог этой жизни.`;

  return { system, user };
}
