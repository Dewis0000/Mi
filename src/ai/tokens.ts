// Оценка числа токенов, стоимости вызова и клиентские защитные лимиты
// (частота вызовов и бюджет). Чистые функции и простое in-memory состояние,
// без побочных эффектов при импорте.

import { encode } from 'gpt-tokenizer';

const CYRILLIC_RE = /[Ѐ-ӿ]/g;

/**
 * Оцениваем число токенов. gpt-tokenizer (BPE для GPT-моделей) хорошо
 * откалиброван на английский текст (~4 символа/токен), но кириллица
 * токенизируется заметно хуже (~2.5 символа/токена на практике у большинства
 * провайдеров, не только OpenAI). Поэтому: если текст в основном кириллический,
 * используем оценку по длине строки (length / 2.5), иначе — честный BPE-подсчёт.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cyrillicMatches = text.match(CYRILLIC_RE);
  const cyrillicCount = cyrillicMatches ? cyrillicMatches.length : 0;
  const letterish = text.replace(/[^\p{L}]/gu, '').length;
  const isMostlyCyrillic = letterish > 0 && cyrillicCount / letterish > 0.5;

  if (isMostlyCyrillic) {
    return Math.ceil(text.length / 2.5);
  }

  try {
    return encode(text).length;
  } catch {
    // На случай экзотического ввода, который токенайзер не переварил —
    // грубая английская оценка как последний рубеж.
    return Math.ceil(text.length / 4);
  }
}

export function estimateCostUsd(
  tokensIn: number,
  tokensOut: number,
  model: { inputPricePerM: number; outputPricePerM: number },
): number {
  const costIn = (tokensIn / 1_000_000) * model.inputPricePerM;
  const costOut = (tokensOut / 1_000_000) * model.outputPricePerM;
  return costIn + costOut;
}

// Жёсткие ограничения безопасности клиента (см. спецификацию):
// не больше 40 вызовов за скользящее окно 60 секунд,
// не больше 2500 токенов на один вызов.
const MAX_CALLS_PER_WINDOW = 40;
const WINDOW_MS = 60_000;
const MAX_TOKENS_PER_CALL = 2500;

export interface RateLimiter {
  canCall(estimatedTokens: number): { ok: true } | { ok: false; reason: string };
  recordCall(actualTokensIn: number, actualTokensOut: number): void;
}

export function createRateLimiter(): RateLimiter {
  // Временные метки прошедших вызовов, самые старые — в начале массива.
  const callTimestamps: number[] = [];

  function pruneOldCalls(now: number): void {
    while (callTimestamps.length > 0 && now - callTimestamps[0] > WINDOW_MS) {
      callTimestamps.shift();
    }
  }

  return {
    canCall(estimatedTokens: number): { ok: true } | { ok: false; reason: string } {
      if (estimatedTokens > MAX_TOKENS_PER_CALL) {
        return {
          ok: false,
          reason: `Оценка токенов (${estimatedTokens}) превышает допустимый лимит на один вызов (${MAX_TOKENS_PER_CALL}).`,
        };
      }
      const now = Date.now();
      pruneOldCalls(now);
      if (callTimestamps.length >= MAX_CALLS_PER_WINDOW) {
        return {
          ok: false,
          reason: `Превышен лимит обращений к ИИ: не более ${MAX_CALLS_PER_WINDOW} вызовов за 60 секунд.`,
        };
      }
      return { ok: true };
    },
    recordCall(_actualTokensIn: number, _actualTokensOut: number): void {
      // Токены вызова здесь не нужны для самого лимитера (он считает только
      // частоту вызовов), но сигнатура сохранена по контракту — вызывающий
      // код может использовать эти значения для своей бухгалтерии бюджета.
      callTimestamps.push(Date.now());
    },
  };
}

export interface BudgetTracker {
  wouldExceed(estimatedCostUsd: number, budget: { limitUsd: number; spentUsd: number }): boolean;
  statusAt(spentUsd: number, limitUsd: number): 'ok' | 'warn75' | 'confirm90' | 'exhausted100';
}

export const budgetTracker: BudgetTracker = {
  wouldExceed(estimatedCostUsd, budget) {
    return budget.spentUsd + estimatedCostUsd > budget.limitUsd;
  },
  statusAt(spentUsd, limitUsd) {
    if (limitUsd <= 0) return 'exhausted100';
    const ratio = spentUsd / limitUsd;
    if (ratio >= 1) return 'exhausted100';
    if (ratio >= 0.9) return 'confirm90';
    if (ratio >= 0.75) return 'warn75';
    return 'ok';
  },
};
