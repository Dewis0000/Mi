// Статические описания провайдеров ИИ и резервные списки моделей.
// Никаких сетевых вызовов и побочных эффектов на уровне модуля — только константы.

import type { AiProviderId, AiModelInfo } from '../types';

export interface ProviderDef {
  id: AiProviderId;
  label: string;
  keyHelpUrl: string; // реальная ссылка на страницу получения API-ключа
  keyHelpLabel: { ru: string; en: string };
  baseUrl: string; // базовый URL API по умолчанию; '' для 'custom'
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    keyHelpLabel: {
      ru: 'Получить API-ключ OpenAI',
      en: 'Get an OpenAI API key',
    },
    baseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
    keyHelpLabel: {
      ru: 'Получить API-ключ Anthropic',
      en: 'Get an Anthropic API key',
    },
    baseUrl: 'https://api.anthropic.com',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    keyHelpUrl: 'https://aistudio.google.com/app/apikey',
    keyHelpLabel: {
      ru: 'Получить API-ключ Google AI Studio',
      en: 'Get a Google AI Studio API key',
    },
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    keyHelpUrl: 'https://openrouter.ai/keys',
    keyHelpLabel: {
      ru: 'Получить API-ключ OpenRouter',
      en: 'Get an OpenRouter API key',
    },
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'custom',
    label: 'Свой сервер (OpenAI-совместимый)',
    keyHelpUrl: 'https://platform.openai.com/docs/api-reference',
    keyHelpLabel: {
      ru: 'Укажите адрес своего локального сервера (например, Ollama или LM Studio)',
      en: 'Point to your own local server (e.g. Ollama or LM Studio)',
    },
    baseUrl: '',
  },
];

// Дата, на которую актуальны цены ниже (используется в дисклеймере UI).
export const PRICING_AS_OF = '2026-09';

// Цены приблизительные, но внутренне согласованные по тирам: economy < balanced < literary.
export const DEFAULT_MODELS: Record<AiProviderId, AiModelInfo[]> = {
  openai: [
    {
      id: 'gpt-4.1-mini',
      label: 'GPT-4.1 Mini',
      inputPricePerM: 0.4,
      outputPricePerM: 1.6,
      speed: 'быстрая',
      tier: 'economy',
    },
    {
      id: 'gpt-4.1',
      label: 'GPT-4.1',
      inputPricePerM: 2.0,
      outputPricePerM: 8.0,
      speed: 'средняя',
      tier: 'balanced',
    },
    {
      id: 'gpt-4o',
      label: 'GPT-4o',
      inputPricePerM: 2.5,
      outputPricePerM: 10.0,
      speed: 'средняя',
      tier: 'balanced',
    },
    {
      id: 'gpt-5-thinking',
      label: 'GPT-5 Thinking',
      inputPricePerM: 10.0,
      outputPricePerM: 30.0,
      speed: 'медленная',
      tier: 'literary',
    },
  ],
  anthropic: [
    {
      id: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5',
      inputPricePerM: 0.8,
      outputPricePerM: 4.0,
      speed: 'быстрая',
      tier: 'economy',
    },
    {
      id: 'claude-sonnet-4-5',
      label: 'Claude Sonnet 4.5',
      inputPricePerM: 3.0,
      outputPricePerM: 15.0,
      speed: 'средняя',
      tier: 'balanced',
    },
    {
      id: 'claude-opus-4-5',
      label: 'Claude Opus 4.5',
      inputPricePerM: 15.0,
      outputPricePerM: 75.0,
      speed: 'медленная',
      tier: 'literary',
    },
  ],
  google: [
    {
      id: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash-Lite',
      inputPricePerM: 0.1,
      outputPricePerM: 0.4,
      speed: 'быстрая',
      tier: 'economy',
    },
    {
      id: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      inputPricePerM: 0.3,
      outputPricePerM: 2.5,
      speed: 'быстрая',
      tier: 'balanced',
    },
    {
      id: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      inputPricePerM: 1.25,
      outputPricePerM: 10.0,
      speed: 'медленная',
      tier: 'literary',
    },
  ],
  openrouter: [
    {
      id: 'meta-llama/llama-3.3-8b-instruct',
      label: 'Llama 3.3 8B Instruct',
      inputPricePerM: 0.06,
      outputPricePerM: 0.06,
      speed: 'быстрая',
      tier: 'economy',
    },
    {
      id: 'google/gemini-2.5-flash',
      label: 'Gemini 2.5 Flash (OpenRouter)',
      inputPricePerM: 0.3,
      outputPricePerM: 2.5,
      speed: 'быстрая',
      tier: 'balanced',
    },
    {
      id: 'anthropic/claude-sonnet-4.5',
      label: 'Claude Sonnet 4.5 (OpenRouter)',
      inputPricePerM: 3.0,
      outputPricePerM: 15.0,
      speed: 'средняя',
      tier: 'balanced',
    },
    {
      id: 'openai/gpt-5-thinking',
      label: 'GPT-5 Thinking (OpenRouter)',
      inputPricePerM: 10.0,
      outputPricePerM: 30.0,
      speed: 'медленная',
      tier: 'literary',
    },
  ],
  custom: [],
};
