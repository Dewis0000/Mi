// Склейка движка/оффлайн-пула с реальными вызовами ИИ (раздел 11/12).
// Именно здесь живут экономические правила: minor — всегда из оффлайн-пула,
// notable/major/эпилог — через ИИ, если он настроен; бюджет и частотный
// лимит проверяются ДО запроса; кэш по хэшу контекста в sessionStorage;
// любой сбой/отказ постфильтра тихо откатывается на оффлайн-текст.
import { describeEvent, generateEpilogue, phraseChoices, type ProviderCallConfig } from '../ai/client';
import { offlineChoiceLabel, offlineEpilogue, offlineEventText, type EpilogueInput } from '../ai/offline';
import { DEFAULT_MODELS } from '../ai/providers';
import { budgetTracker, createRateLimiter, estimateCostUsd, estimateTokens } from '../ai/tokens';
import { getBaseUrl, getKey } from './aiKeyHolder';
import type { AiModelInfo, AiState, Character, Choice, Country, EventDefinition, Stats } from '../types';
import type { Locale } from '../i18n';

const rateLimiter = createRateLimiter();

function resolveModelInfo(ai: AiState): AiModelInfo | null {
  if (!ai.provider || !ai.model) return null;
  return DEFAULT_MODELS[ai.provider]?.find((m) => m.id === ai.model) ?? null;
}

function buildConfig(ai: AiState): ProviderCallConfig | null {
  if (!ai.provider || !ai.model) return null;
  const apiKey = getKey();
  if (!apiKey) return null;
  return {
    provider: ai.provider,
    apiKey,
    model: ai.model,
    baseUrl: ai.provider === 'custom' ? getBaseUrl() : undefined,
  };
}

export function canUseAi(ai: AiState): boolean {
  return !!ai.provider && !!ai.model && ai.verified && !ai.degraded && !!getKey();
}

function shouldUseAiForSeverity(severity: EventDefinition['severity'], describeAllViaAi: boolean): boolean {
  if (describeAllViaAi) return true;
  return severity === 'notable' || severity === 'major';
}

function cacheKey(parts: unknown): string {
  return `oob.ai.cache.${JSON.stringify(parts)}`;
}

function readCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* переполнение/недоступность sessionStorage — не критично, просто не кэшируем */
  }
}

export interface AiUsageRecord {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  ms: number;
}

export interface ResolveEventTextResult {
  title: string;
  body: string;
  source: 'ai' | 'offline';
  usage?: AiUsageRecord;
  newlyDegraded?: string;
}

export async function resolveEventText(
  def: EventDefinition,
  character: Character,
  country: Country,
  traitLabels: string[],
  recentEventTitles: string[],
  locale: Locale,
  ai: AiState,
): Promise<ResolveEventTextResult> {
  const offline = offlineEventText(def, locale);

  if (!shouldUseAiForSeverity(def.severity, ai.describeAllViaAi) || !canUseAi(ai)) {
    return { title: offline.title, body: offline.body, source: 'offline' };
  }

  const cfg = buildConfig(ai);
  const model = resolveModelInfo(ai);
  if (!cfg || !model) return { title: offline.title, body: offline.body, source: 'offline' };

  const key = cacheKey(['event', def.id, character.ageYears, character.countryIso3, locale, ai.model]);
  const cached = readCache<{ title: string; body: string }>(key);
  if (cached) return { title: cached.title, body: cached.body, source: 'ai' };

  const estimate = estimateTokens(offline.title + offline.body) + 220;
  const limitCheck = rateLimiter.canCall(estimate);
  if (!limitCheck.ok || budgetTracker.wouldExceed(estimateCostUsd(estimate, 120, model), ai.budget)) {
    return { title: offline.title, body: offline.body, source: 'offline' };
  }

  const startedAt = Date.now();
  const result = await describeEvent(cfg, {
    character: {
      sex: character.sex,
      age: character.ageYears,
      countryName: country.name[locale] ?? country.name.ru,
      incomeTier: country.incomeTier,
      traitLabels,
    },
    recentEventTitles,
    firedEvent: {
      category: def.category,
      severity: def.severity,
      offlineTitle: offline.title,
      offlineBody: offline.body,
    },
    locale,
  });
  const ms = Date.now() - startedAt;
  rateLimiter.recordCall(estimate, result?.usage.outputTokens ?? 0);

  if (!result) {
    return { title: offline.title, body: offline.body, source: 'offline', newlyDegraded: 'Провайдер не ответил или отклонил запрос.' };
  }

  writeCache(key, { title: result.title, body: result.body });
  const costUsd = estimateCostUsd(result.usage.inputTokens, result.usage.outputTokens, model);
  return {
    title: result.title,
    body: result.body,
    source: 'ai',
    usage: { tokensIn: result.usage.inputTokens, tokensOut: result.usage.outputTokens, costUsd, ms },
  };
}

export interface ResolveChoiceLabelsResult {
  labels: Record<string, string>;
  source: 'ai' | 'offline';
  usage?: AiUsageRecord;
}

function effectDirection(effects: Partial<Stats>): string {
  const parts: string[] = [];
  const names: Record<keyof Stats, string> = {
    health: 'здоровье',
    wealth: 'благополучие',
    education: 'образование',
    bonds: 'связи',
    standing: 'положение',
  };
  for (const key of Object.keys(effects) as Array<keyof Stats>) {
    const v = effects[key] ?? 0;
    if (v === 0) continue;
    parts.push(`${names[key]} ${v > 0 ? 'вверх' : 'вниз'}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'без заметного эффекта';
}

export async function resolveChoiceLabels(
  def: EventDefinition,
  choices: Choice[],
  character: Character,
  locale: Locale,
  ai: AiState,
  offlineTitle: string,
  offlineBody: string,
): Promise<ResolveChoiceLabelsResult> {
  const offlineLabels: Record<string, string> = {};
  for (const c of choices) offlineLabels[c.id] = offlineChoiceLabel(def.id, c.id, locale);

  if (!shouldUseAiForSeverity(def.severity, ai.describeAllViaAi) || !canUseAi(ai)) {
    return { labels: offlineLabels, source: 'offline' };
  }
  const cfg = buildConfig(ai);
  const model = resolveModelInfo(ai);
  if (!cfg || !model) return { labels: offlineLabels, source: 'offline' };

  const key = cacheKey(['choices', def.id, choices.map((c) => c.id).join(','), locale, ai.model]);
  const cached = readCache<Record<string, string>>(key);
  if (cached) return { labels: cached, source: 'ai' };

  const estimate = estimateTokens(offlineBody) + 150;
  const limitCheck = rateLimiter.canCall(estimate);
  if (!limitCheck.ok || budgetTracker.wouldExceed(estimateCostUsd(estimate, 80, model), ai.budget)) {
    return { labels: offlineLabels, source: 'offline' };
  }

  const startedAt = Date.now();
  const result = await phraseChoices(cfg, {
    offlineTitle,
    offlineBody,
    choices: choices.map((c) => ({ id: c.id, riskLabel: c.riskLabel, effectDirection: effectDirection(c.effects) })),
    locale,
    characterAge: character.ageYears,
    category: def.category,
  });
  const ms = Date.now() - startedAt;
  rateLimiter.recordCall(estimate, result?.usage.outputTokens ?? 0);

  if (!result) return { labels: offlineLabels, source: 'offline' };

  writeCache(key, result.labels);
  const costUsd = estimateCostUsd(result.usage.inputTokens, result.usage.outputTokens, model);
  return { labels: result.labels, source: 'ai', usage: { tokensIn: result.usage.inputTokens, tokensOut: result.usage.outputTokens, costUsd, ms } };
}

export interface ResolveEpilogueResult {
  text: string;
  source: 'ai' | 'offline';
  usage?: AiUsageRecord;
}

export async function resolveEpilogue(input: EpilogueInput, locale: Locale, ai: AiState): Promise<ResolveEpilogueResult> {
  const offline = offlineEpilogue(input, locale);
  if (!canUseAi(ai)) return { text: offline, source: 'offline' };

  const cfg = buildConfig(ai);
  // Эпилог — единственный вызов, для которого стоит лучшая доступная
  // модель (раздел 11), но у нас нет отдельного "literary"-слота в AiState —
  // используем настроенную модель пользователя как есть.
  const model = resolveModelInfo(ai);
  if (!cfg || !model) return { text: offline, source: 'offline' };

  const estimate = estimateTokens(offline) + 300;
  const limitCheck = rateLimiter.canCall(estimate);
  if (!limitCheck.ok || budgetTracker.wouldExceed(estimateCostUsd(estimate, 260, model), ai.budget)) {
    return { text: offline, source: 'offline' };
  }

  const startedAt = Date.now();
  const result = await generateEpilogue(cfg, {
    countryName: input.countryName,
    sex: input.sex,
    ageAtDeath: input.ageAtDeath,
    causeOfDeathLabel: input.causeOfDeathLabel,
    keyEvents: input.notableEventTitles.map((title) => ({ title, category: 'life' })),
    finalStats: input.finalStats,
    locale,
  });
  const ms = Date.now() - startedAt;
  rateLimiter.recordCall(estimate, result?.usage.outputTokens ?? 0);

  if (!result) return { text: offline, source: 'offline' };

  const costUsd = estimateCostUsd(result.usage.inputTokens, result.usage.outputTokens, model);
  return { text: result.text, source: 'ai', usage: { tokensIn: result.usage.inputTokens, tokensOut: result.usage.outputTokens, costUsd, ms } };
}
