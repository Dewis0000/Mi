// Единственный модуль, который реально делает fetch() к провайдерам ИИ.
// Все экспортируемые функции обязаны НИКОГДА не бросать исключений наружу —
// вызывающий код (стор) полагается на это, чтобы безопасно откатиться на
// офлайн-текст без try/catch на каждом месте вызова.

import type { AiProviderId, AiModelInfo } from '../types';
import { PROVIDERS, DEFAULT_MODELS } from './providers';
import { passesContentSafety } from './postfilter';
import { estimateTokens } from './tokens';
import {
  buildEventPrompt,
  buildChoicePrompt,
  buildEpiloguePrompt,
  type EventPromptInput,
  type ChoicePromptInput,
  type EpiloguePromptInput,
} from './prompts';

export interface ProviderCallConfig {
  provider: AiProviderId;
  apiKey: string;
  baseUrl?: string; // обязателен и используется, когда provider === 'custom'
  model: string;
}

interface Usage {
  inputTokens: number;
  outputTokens: number;
}

const TIMEOUT_MS = 12_000;
// Температура для генерации текста событий/эпилогов (см. src/ai/prompts.ts) —
// задаётся здесь, в единственном месте, которое реально отправляет запросы.
const GENERATION_TEMPERATURE = 0.9;
const DEFAULT_MAX_OUTPUT_TOKENS = 500;

function providerDef(id: AiProviderId) {
  return PROVIDERS.find((p) => p.id === id) ?? null;
}

function resolveBaseUrl(cfg: ProviderCallConfig): string | null {
  if (cfg.baseUrl && cfg.baseUrl.trim().length > 0) return cfg.baseUrl.replace(/\/+$/, '');
  const def = providerDef(cfg.provider);
  if (!def) return null;
  if (cfg.provider === 'custom') return null; // custom обязан передать свой baseUrl
  return def.baseUrl.replace(/\/+$/, '');
}

// --- Низкоуровневый fetch с таймаутом, никогда не бросает ---

interface FetchOutcome {
  networkError: boolean;
  status: number;
  bodyText: string;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = TIMEOUT_MS,
): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const bodyText = await res.text();
    return { networkError: false, status: res.status, bodyText };
  } catch {
    return { networkError: true, status: 0, bodyText: '' };
  } finally {
    clearTimeout(timer);
  }
}

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Снимает возможную обёртку ```json ... ``` вокруг ответа модели. */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

// --- Разбор ошибок провайдера в конкретные сообщения (лучшее усилие) ---

function extractMessage(bodyJson: unknown): string {
  if (isRecord(bodyJson)) {
    const err = bodyJson.error;
    if (isRecord(err) && typeof err.message === 'string') return err.message;
    if (typeof bodyJson.message === 'string') return bodyJson.message;
  }
  return '';
}

function describeOpenAiLikeError(status: number, bodyJson: unknown): string {
  const message = extractMessage(bodyJson).toLowerCase();
  const code = isRecord(bodyJson) && isRecord(bodyJson.error) ? bodyJson.error.code : undefined;
  if (status === 401) return 'Неверный API-ключ.';
  if (status === 404) return 'Модель недоступна для этого ключа (нет доступа или неверный id модели).';
  if (status === 403) {
    if (message.includes('region') || message.includes('territory') || message.includes('country')) {
      return 'Доступ заблокирован для вашего региона.';
    }
    return 'Доступ запрещён для этого ключа или модели.';
  }
  if (status === 429) {
    if (code === 'insufficient_quota' || message.includes('quota') || message.includes('balance')) {
      return 'Исчерпан баланс или квота у провайдера.';
    }
    return 'Превышен лимит частоты запросов (rate limit) у провайдера — попробуйте позже.';
  }
  return `Ошибка провайдера (HTTP ${status}).`;
}

function describeAnthropicError(status: number, bodyJson: unknown): string {
  const type = isRecord(bodyJson) && isRecord(bodyJson.error) ? bodyJson.error.type : undefined;
  if (status === 401 || type === 'authentication_error') return 'Неверный API-ключ.';
  if (status === 403 || type === 'permission_error') {
    return 'Нет доступа к этой модели с данным ключом.';
  }
  if (status === 429 || type === 'rate_limit_error') {
    return 'Превышен лимит частоты запросов или исчерпана квота у провайдера.';
  }
  if (status === 404 || type === 'not_found_error') {
    return 'Модель не найдена (неверный id модели).';
  }
  return `Ошибка провайдера (HTTP ${status}).`;
}

function describeGoogleError(status: number, bodyJson: unknown): string {
  // Google оборачивает ошибку в { error: { code, message, status } }.
  const inner = isRecord(bodyJson) ? bodyJson.error : undefined;
  const googleStatus = isRecord(inner) && typeof inner.status === 'string' ? inner.status : '';
  const message = extractMessage(bodyJson).toLowerCase();
  if (status === 400 && (googleStatus === 'INVALID_ARGUMENT' || message.includes('api key'))) {
    return 'Неверный API-ключ.';
  }
  if (status === 403 || googleStatus === 'PERMISSION_DENIED') {
    return 'Нет доступа к этой модели с данным ключом.';
  }
  if (status === 429 || googleStatus === 'RESOURCE_EXHAUSTED') {
    return 'Превышен лимит частоты запросов или исчерпана квота у провайдера.';
  }
  if (message.includes('location is not supported') || message.includes('region')) {
    return 'Доступ заблокирован для вашего региона.';
  }
  return `Ошибка провайдера (HTTP ${status}).`;
}

function describeProviderError(provider: AiProviderId, status: number, bodyText: string): string {
  const bodyJson = safeJsonParse(bodyText);
  switch (provider) {
    case 'openai':
    case 'openrouter':
    case 'custom':
      return describeOpenAiLikeError(status, bodyJson);
    case 'anthropic':
      return describeAnthropicError(status, bodyJson);
    case 'google':
      return describeGoogleError(status, bodyJson);
    default:
      return `Ошибка провайдера (HTTP ${status}).`;
  }
}

// --- verifyKey ---

export async function verifyKey(
  cfg: ProviderCallConfig,
): Promise<{ ok: true; label?: string } | { ok: false; error: string }> {
  try {
    if (cfg.provider === 'custom' && (!cfg.baseUrl || cfg.baseUrl.trim().length === 0)) {
      return { ok: false, error: 'Для своего сервера нужно указать адрес (baseUrl).' };
    }
    const baseUrl = resolveBaseUrl(cfg);
    if (!baseUrl) return { ok: false, error: 'Не удалось определить адрес API.' };

    if (cfg.provider === 'openai') {
      const res = await fetchWithTimeout(`${baseUrl}/models/${encodeURIComponent(cfg.model)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      });
      if (res.networkError) return { ok: false, error: 'Сеть недоступна или провайдер не отвечает.' };
      if (res.status >= 200 && res.status < 300) {
        const json = safeJsonParse(res.bodyText);
        const label = isRecord(json) && typeof json.id === 'string' ? json.id : undefined;
        return { ok: true, label };
      }
      return { ok: false, error: describeProviderError('openai', res.status, res.bodyText) };
    }

    if (cfg.provider === 'anthropic') {
      const res = await fetchWithTimeout(`${baseUrl}/v1/models/${encodeURIComponent(cfg.model)}`, {
        method: 'GET',
        headers: {
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      });
      if (res.networkError) return { ok: false, error: 'Сеть недоступна или провайдер не отвечает.' };
      if (res.status >= 200 && res.status < 300) {
        const json = safeJsonParse(res.bodyText);
        const label =
          isRecord(json) && typeof json.display_name === 'string' ? json.display_name : undefined;
        return { ok: true, label };
      }
      return { ok: false, error: describeProviderError('anthropic', res.status, res.bodyText) };
    }

    if (cfg.provider === 'google') {
      const res = await fetchWithTimeout(`${baseUrl}/models/${encodeURIComponent(cfg.model)}`, {
        method: 'GET',
        headers: { 'x-goog-api-key': cfg.apiKey },
      });
      if (res.networkError) return { ok: false, error: 'Сеть недоступна или провайдер не отвечает.' };
      if (res.status >= 200 && res.status < 300) {
        const json = safeJsonParse(res.bodyText);
        const label =
          isRecord(json) && typeof json.displayName === 'string' ? json.displayName : undefined;
        return { ok: true, label };
      }
      return { ok: false, error: describeProviderError('google', res.status, res.bodyText) };
    }

    if (cfg.provider === 'openrouter') {
      // У OpenRouter есть собственный лёгкий эндпоинт проверки ключа.
      const res = await fetchWithTimeout(`${baseUrl}/auth/key`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      });
      if (res.networkError) return { ok: false, error: 'Сеть недоступна или провайдер не отвечает.' };
      if (res.status >= 200 && res.status < 300) {
        // Этот эндпоинт подтверждает только валидность ключа, не доступ
        // именно к cfg.model — такое разграничение OpenRouter отдельно не
        // отдаёт в лёгком виде, это известное ограничение проверки.
        return { ok: true };
      }
      return { ok: false, error: describeProviderError('openrouter', res.status, res.bodyText) };
    }

    // custom: OpenAI-совместимый локальный сервер — проверяем через список моделей.
    const res = await fetchWithTimeout(`${baseUrl}/models`, {
      method: 'GET',
      headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
    });
    if (res.networkError) {
      return { ok: false, error: 'Не удалось подключиться к указанному серверу.' };
    }
    if (res.status >= 200 && res.status < 300) {
      return { ok: true };
    }
    return { ok: false, error: describeProviderError('custom', res.status, res.bodyText) };
  } catch {
    return { ok: false, error: 'Непредвиденная ошибка при проверке ключа.' };
  }
}

// --- listModels ---

const FALLBACK_MODEL_DEFAULTS: Pick<AiModelInfo, 'inputPricePerM' | 'outputPricePerM' | 'speed' | 'tier'> = {
  inputPricePerM: 1,
  outputPricePerM: 3,
  speed: 'средняя',
  tier: 'balanced',
};

function toAiModelInfo(provider: AiProviderId, id: string, liveLabel?: string): AiModelInfo {
  const known = DEFAULT_MODELS[provider]?.find((m) => m.id === id);
  if (known) {
    return { ...known, label: liveLabel ?? known.label };
  }
  return {
    id,
    label: liveLabel ?? id,
    ...FALLBACK_MODEL_DEFAULTS,
  };
}

export async function listModels(cfg: ProviderCallConfig): Promise<AiModelInfo[] | null> {
  try {
    const baseUrl = resolveBaseUrl(cfg);
    if (!baseUrl) return null;

    if (cfg.provider === 'openai') {
      const res = await fetchWithTimeout(`${baseUrl}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      });
      if (res.networkError || res.status < 200 || res.status >= 300) return null;
      const json = safeJsonParse(res.bodyText);
      if (!isRecord(json) || !Array.isArray(json.data)) return null;
      const ids = json.data
        .filter(isRecord)
        .map((m) => (typeof m.id === 'string' ? m.id : null))
        .filter((id): id is string => id !== null)
        // Оставляем только чат-модели — у OpenAI в общем списке также
        // embeddings/whisper/tts/dall-e, которые chat/completions не умеют.
        .filter((id) => /^(gpt|o1|o3|o4|chatgpt)/.test(id));
      return ids.map((id) => toAiModelInfo('openai', id));
    }

    if (cfg.provider === 'anthropic') {
      const res = await fetchWithTimeout(`${baseUrl}/v1/models`, {
        method: 'GET',
        headers: {
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      });
      if (res.networkError || res.status < 200 || res.status >= 300) return null;
      const json = safeJsonParse(res.bodyText);
      if (!isRecord(json) || !Array.isArray(json.data)) return null;
      return json.data
        .filter(isRecord)
        .map((m) => {
          const id = typeof m.id === 'string' ? m.id : null;
          if (!id) return null;
          const label = typeof m.display_name === 'string' ? m.display_name : undefined;
          return toAiModelInfo('anthropic', id, label);
        })
        .filter((m): m is AiModelInfo => m !== null);
    }

    if (cfg.provider === 'google') {
      const res = await fetchWithTimeout(`${baseUrl}/models`, {
        method: 'GET',
        headers: { 'x-goog-api-key': cfg.apiKey },
      });
      if (res.networkError || res.status < 200 || res.status >= 300) return null;
      const json = safeJsonParse(res.bodyText);
      if (!isRecord(json) || !Array.isArray(json.models)) return null;
      return json.models
        .filter(isRecord)
        .filter((m) => {
          const methods = m.supportedGenerationMethods;
          return Array.isArray(methods) && methods.includes('generateContent');
        })
        .map((m) => {
          const rawName = typeof m.name === 'string' ? m.name : null;
          if (!rawName) return null;
          const id = rawName.startsWith('models/') ? rawName.slice('models/'.length) : rawName;
          const label = typeof m.displayName === 'string' ? m.displayName : undefined;
          return toAiModelInfo('google', id, label);
        })
        .filter((m): m is AiModelInfo => m !== null);
    }

    if (cfg.provider === 'openrouter') {
      const res = await fetchWithTimeout(`${baseUrl}/models`, { method: 'GET' });
      if (res.networkError || res.status < 200 || res.status >= 300) return null;
      const json = safeJsonParse(res.bodyText);
      if (!isRecord(json) || !Array.isArray(json.data)) return null;
      return json.data
        .filter(isRecord)
        .map((m) => {
          const id = typeof m.id === 'string' ? m.id : null;
          if (!id) return null;
          const label = typeof m.name === 'string' ? m.name : undefined;
          return toAiModelInfo('openrouter', id, label);
        })
        .filter((m): m is AiModelInfo => m !== null);
    }

    // custom: пробуем OpenAI-совместимый /models; если сервер его не отдаёт —
    // возвращаем null, и вызывающий код использует DEFAULT_MODELS.custom ([]).
    const res = await fetchWithTimeout(`${baseUrl}/models`, {
      method: 'GET',
      headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
    });
    if (res.networkError || res.status < 200 || res.status >= 300) return null;
    const json = safeJsonParse(res.bodyText);
    if (!isRecord(json) || !Array.isArray(json.data)) return null;
    return json.data
      .filter(isRecord)
      .map((m) => (typeof m.id === 'string' ? toAiModelInfo('custom', m.id) : null))
      .filter((m): m is AiModelInfo => m !== null);
  } catch {
    return null;
  }
}

// --- callForJson ---

interface ChatMessageSpec {
  system: string;
  user: string;
}

async function callProviderRaw(
  cfg: ProviderCallConfig,
  prompt: ChatMessageSpec,
  maxOutputTokens: number,
): Promise<{ text: string; usage: Usage } | { error: string } | null> {
  const baseUrl = resolveBaseUrl(cfg);
  if (!baseUrl) return { error: 'Не удалось определить адрес API.' };

  if (cfg.provider === 'openai' || cfg.provider === 'openrouter' || cfg.provider === 'custom') {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: GENERATION_TEMPERATURE,
      max_tokens: maxOutputTokens,
      response_format: { type: 'json_object' },
    };
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    };
    const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (res.networkError) return null;
    if (res.status < 200 || res.status >= 300) {
      return { error: describeProviderError(cfg.provider, res.status, res.bodyText) };
    }
    const json = safeJsonParse(res.bodyText);
    if (!isRecord(json) || !Array.isArray(json.choices) || json.choices.length === 0) return null;
    const first = json.choices[0];
    if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== 'string') {
      return null;
    }
    const text = first.message.content;
    const usageRaw = isRecord(json.usage) ? json.usage : {};
    const inputTokens = typeof usageRaw.prompt_tokens === 'number' ? usageRaw.prompt_tokens : null;
    const outputTokens = typeof usageRaw.completion_tokens === 'number' ? usageRaw.completion_tokens : null;
    return {
      text,
      usage: {
        inputTokens: inputTokens ?? estimateTokens(prompt.system + prompt.user),
        outputTokens: outputTokens ?? estimateTokens(text),
      },
    };
  }

  if (cfg.provider === 'anthropic') {
    const body = {
      model: cfg.model,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      temperature: GENERATION_TEMPERATURE,
      max_tokens: maxOutputTokens,
    };
    const res = await fetchWithTimeout(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        // Критически важно для вызовов из браузера — без этого заголовка
        // будет CORS-отказ.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
    if (res.networkError) return null;
    if (res.status < 200 || res.status >= 300) {
      return { error: describeProviderError('anthropic', res.status, res.bodyText) };
    }
    const json = safeJsonParse(res.bodyText);
    if (!isRecord(json) || !Array.isArray(json.content) || json.content.length === 0) return null;
    const firstBlock = json.content.find((b) => isRecord(b) && b.type === 'text');
    if (!isRecord(firstBlock) || typeof firstBlock.text !== 'string') return null;
    const text = firstBlock.text;
    const usageRaw = isRecord(json.usage) ? json.usage : {};
    const inputTokens = typeof usageRaw.input_tokens === 'number' ? usageRaw.input_tokens : null;
    const outputTokens = typeof usageRaw.output_tokens === 'number' ? usageRaw.output_tokens : null;
    return {
      text,
      usage: {
        inputTokens: inputTokens ?? estimateTokens(prompt.system + prompt.user),
        outputTokens: outputTokens ?? estimateTokens(text),
      },
    };
  }

  if (cfg.provider === 'google') {
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
      systemInstruction: { parts: [{ text: prompt.system }] },
      generationConfig: {
        temperature: GENERATION_TEMPERATURE,
        maxOutputTokens,
        responseMimeType: 'application/json',
      },
    };
    const res = await fetchWithTimeout(
      `${baseUrl}/models/${encodeURIComponent(cfg.model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cfg.apiKey,
        },
        body: JSON.stringify(body),
      },
    );
    if (res.networkError) return null;
    if (res.status < 200 || res.status >= 300) {
      return { error: describeProviderError('google', res.status, res.bodyText) };
    }
    const json = safeJsonParse(res.bodyText);
    if (!isRecord(json) || !Array.isArray(json.candidates) || json.candidates.length === 0) return null;
    const candidate = json.candidates[0];
    if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
      return null;
    }
    const partsText = candidate.content.parts
      .filter(isRecord)
      .map((p) => (typeof p.text === 'string' ? p.text : ''))
      .join('');
    if (!partsText) return null;
    const usageRaw = isRecord(json.usageMetadata) ? json.usageMetadata : {};
    const inputTokens = typeof usageRaw.promptTokenCount === 'number' ? usageRaw.promptTokenCount : null;
    const outputTokens =
      typeof usageRaw.candidatesTokenCount === 'number' ? usageRaw.candidatesTokenCount : null;
    return {
      text: partsText,
      usage: {
        inputTokens: inputTokens ?? estimateTokens(prompt.system + prompt.user),
        outputTokens: outputTokens ?? estimateTokens(partsText),
      },
    };
  }

  return null;
}

export async function callForJson<T>(
  cfg: ProviderCallConfig,
  systemPrompt: string,
  userPrompt: string,
  opts?: { maxOutputTokens?: number },
): Promise<{ data: T; usage: Usage } | null> {
  try {
    const maxOutputTokens = opts?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    const result = await callProviderRaw(cfg, { system: systemPrompt, user: userPrompt }, maxOutputTokens);
    if (result === null) return null;
    if ('error' in result) return null;

    const cleaned = stripCodeFence(result.text);
    const parsed = safeJsonParse(cleaned);
    if (parsed === null) return null;

    return { data: parsed as T, usage: result.usage };
  } catch {
    return null;
  }
}

// --- Тонкие обёртки поверх callForJson: описание события, формулировка
// вариантов выбора, эпилог. Каждая обёртка валидирует форму ответа и
// прогоняет весь свободный текст через постфильтр безопасности; при
// невалидном JSON/форме делает ровно один повтор того же запроса, прежде
// чем вернуть null (и дать вызывающему коду откатиться на офлайн-текст).

interface EventResult {
  title: string;
  body: string;
  usage: Usage;
}

export async function describeEvent(
  cfg: ProviderCallConfig,
  input: EventPromptInput,
): Promise<EventResult | null> {
  const { system, user } = buildEventPrompt(input);
  const ctx = { characterAge: input.character.age, category: input.firedEvent.category };

  const attempt = async (): Promise<EventResult | null> => {
    const res = await callForJson<{ title?: unknown; body?: unknown }>(cfg, system, user);
    if (!res) return null;
    const { title, body } = res.data;
    if (typeof title !== 'string' || typeof body !== 'string') return null;
    if (!title.trim() || !body.trim()) return null;
    if (!passesContentSafety(title, ctx).ok) return null;
    if (!passesContentSafety(body, ctx).ok) return null;
    return { title, body, usage: res.usage };
  };

  const first = await attempt();
  if (first) return first;
  return attempt();
}

interface ChoiceLabelsResult {
  labels: Record<string, string>;
  usage: Usage;
}

export async function phraseChoices(
  cfg: ProviderCallConfig,
  input: ChoicePromptInput,
): Promise<ChoiceLabelsResult | null> {
  const { system, user } = buildChoicePrompt(input);
  const ctx = { characterAge: input.characterAge, category: input.category };
  const expectedIds = input.choices.map((c) => c.id);

  const attempt = async (): Promise<ChoiceLabelsResult | null> => {
    const res = await callForJson<{ labels?: unknown }>(cfg, system, user);
    if (!res) return null;
    const rawLabels = res.data.labels;
    if (!isRecord(rawLabels)) return null;

    const labels: Record<string, string> = {};
    for (const id of expectedIds) {
      const value = rawLabels[id];
      if (typeof value !== 'string' || !value.trim()) return null;
      if (!passesContentSafety(value, ctx).ok) return null;
      labels[id] = value;
    }
    return { labels, usage: res.usage };
  };

  const first = await attempt();
  if (first) return first;
  return attempt();
}

interface EpilogueResult {
  text: string;
  usage: Usage;
}

export async function generateEpilogue(
  cfg: ProviderCallConfig,
  input: EpiloguePromptInput,
): Promise<EpilogueResult | null> {
  const { system, user } = buildEpiloguePrompt(input);
  const ctx = { characterAge: input.ageAtDeath, category: 'epilogue' };

  const attempt = async (): Promise<EpilogueResult | null> => {
    const res = await callForJson<{ text?: unknown }>(cfg, system, user, { maxOutputTokens: 700 });
    if (!res) return null;
    const { text } = res.data;
    if (typeof text !== 'string' || !text.trim()) return null;
    if (!passesContentSafety(text, ctx).ok) return null;
    return { text, usage: res.usage };
  };

  const first = await attempt();
  if (first) return first;
  return attempt();
}
