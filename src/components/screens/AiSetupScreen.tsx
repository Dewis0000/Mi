import { useEffect, useState } from 'react';
import { useGameStore } from '../../store';
import { translate } from '../../i18n';
import { PROVIDERS, DEFAULT_MODELS, PRICING_AS_OF } from '../../ai/providers';
import { verifyKey, listModels } from '../../ai/client';
import { estimateCostUsd } from '../../ai/tokens';
import { getKey, getBaseUrl, setBaseUrl as persistBaseUrl } from '../../store/aiKeyHolder';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import type { AiModelInfo, AiProviderId } from '../../types';

const BASELINE_TOKENS_PER_30MIN = 20_000;

export function AiSetupScreen({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const locale = useGameStore((s) => s.locale);
  const ai = useGameStore((s) => s.ai);
  const setAiProvider = useGameStore((s) => s.setAiProvider);
  const setAiKeyAction = useGameStore((s) => s.setAiKey);
  const setAiBaseUrlAction = useGameStore((s) => s.setAiBaseUrl);
  const setAiModel = useGameStore((s) => s.setAiModel);
  const setAiVerified = useGameStore((s) => s.setAiVerified);
  const setAiBudget = useGameStore((s) => s.setAiBudget);
  const toggleDescribeAll = useGameStore((s) => s.toggleDescribeAll);
  const clearAiKey = useGameStore((s) => s.clearAiKey);

  const [keyInput, setKeyInput] = useState(() => getKey() ?? '');
  const [showKey, setShowKey] = useState(false);
  const [remember, setRemember] = useState(ai.rememberKey);
  const [baseUrlInput, setBaseUrlInput] = useState(() => getBaseUrl());
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    if (!ai.verified || !ai.provider) return;
    setLoadingModels(true);
    const cfg = { provider: ai.provider, apiKey: getKey() ?? '', model: ai.model ?? '', baseUrl: ai.provider === 'custom' ? getBaseUrl() : undefined };
    listModels(cfg)
      .then((list) => setModels(list ?? DEFAULT_MODELS[ai.provider!]))
      .finally(() => setLoadingModels(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.verified, ai.provider]);

  const provider = ai.provider;
  const availableModels = models.length > 0 ? models : provider ? DEFAULT_MODELS[provider] : [];

  async function handleVerify(): Promise<void> {
    if (!provider) return;
    setVerifying(true);
    setVerifyError(null);
    setAiKeyAction(keyInput, remember);
    if (provider === 'custom') persistBaseUrl(baseUrlInput);
    const probeModel = DEFAULT_MODELS[provider][0]?.id ?? 'default';
    const res = await verifyKey({ provider, apiKey: keyInput, model: probeModel, baseUrl: provider === 'custom' ? baseUrlInput : undefined });
    setVerifying(false);
    if (res.ok) {
      setAiVerified(true, res.label);
    } else {
      setAiVerified(false);
      setVerifyError(res.error);
    }
  }

  function pickPreset(tier: 'economy' | 'balanced' | 'literary'): void {
    const candidates = availableModels.filter((m) => m.tier === tier);
    const pool = candidates.length > 0 ? candidates : availableModels;
    if (pool.length === 0) return;
    const chosen =
      tier === 'economy'
        ? pool.reduce((a, b) => (a.inputPricePerM <= b.inputPricePerM ? a : b))
        : tier === 'literary'
          ? pool.reduce((a, b) => (a.inputPricePerM >= b.inputPricePerM ? a : b))
          : pool[Math.floor(pool.length / 2)];
    setAiModel(chosen.id);
  }

  const selectedModel = availableModels.find((m) => m.id === ai.model) ?? null;
  const estTokens = BASELINE_TOKENS_PER_30MIN * 3;
  const estCost = selectedModel ? estimateCostUsd(estTokens * 0.77, estTokens * 0.23, selectedModel) : null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 text-text">
      <h1 className="mb-6 text-xl font-semibold">{translate(locale, 'ai.title')}</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-muted">{translate(locale, 'ai.step1.title')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => setAiProvider(p.id)}
              className={`rounded border px-3 py-3 text-sm transition-colors ${
                provider === p.id ? 'border-accent text-accent' : 'border-border text-text hover:border-accent/50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {provider ? (
          <a href={PROVIDERS.find((p) => p.id === provider)?.keyHelpUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-muted underline">
            {PROVIDERS.find((p) => p.id === provider)?.keyHelpLabel[locale]}
          </a>
        ) : null}
      </section>

      {provider ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-muted">{translate(locale, 'ai.step2.title')}</h2>
          <p className="mb-3 text-xs text-muted">{translate(locale, 'ai.step2.note')}</p>
          {provider === 'custom' ? (
            <input
              type="text"
              value={baseUrlInput}
              onChange={(e) => setBaseUrlInput(e.target.value)}
              placeholder={translate(locale, 'ai.step2.baseUrl')}
              className="mb-2 w-full rounded border border-border bg-bg px-3 py-2 font-mono text-sm text-text"
            />
          ) : null}
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={translate(locale, 'ai.step2.placeholder')}
              className="flex-1 rounded border border-border bg-bg px-3 py-2 font-mono text-sm text-text"
            />
            <Button variant="secondary" onClick={() => setShowKey((v) => !v)} aria-label="toggle visibility">
              {showKey ? '🙈' : '👁'}
            </Button>
            <Button variant="primary" onClick={handleVerify} disabled={!keyInput || verifying}>
              {verifying ? translate(locale, 'common.loading') : translate(locale, 'ai.step2.verify')}
            </Button>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={!remember} onChange={(e) => setRemember(!e.target.checked)} />
            {translate(locale, 'ai.step2.remember')}
          </label>
          {ai.verified ? (
            <p className="mt-2 text-sm text-up">✓ {translate(locale, 'ai.step2.verified')}{ai.verifiedLabel ? ` (${ai.verifiedLabel})` : ''}</p>
          ) : verifyError ? (
            <p className="mt-2 text-sm text-down">{verifyError}</p>
          ) : null}
          {ai.apiKeyPresent ? (
            <button className="mt-2 text-xs text-muted underline" onClick={clearAiKey}>
              {translate(locale, 'common.cancel')}
            </button>
          ) : null}
        </section>
      ) : null}

      {ai.verified ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-muted">{translate(locale, 'ai.step3.title')}</h2>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <button className="rounded border border-border px-2 py-2 text-xs hover:border-accent/50" onClick={() => pickPreset('economy')}>
              {translate(locale, 'ai.step3.preset.economy')}
            </button>
            <button className="rounded border border-border px-2 py-2 text-xs hover:border-accent/50" onClick={() => pickPreset('balanced')}>
              {translate(locale, 'ai.step3.preset.balanced')}
            </button>
            <button className="rounded border border-border px-2 py-2 text-xs hover:border-accent/50" onClick={() => pickPreset('literary')}>
              {translate(locale, 'ai.step3.preset.literary')}
            </button>
          </div>
          {loadingModels ? (
            <p className="text-sm text-muted">{translate(locale, 'common.loading')}</p>
          ) : (
            <select
              value={ai.model ?? ''}
              onChange={(e) => setAiModel(e.target.value)}
              className="w-full rounded border border-border bg-bg px-3 py-2 font-mono text-sm text-text"
            >
              <option value="" disabled>
                —
              </option>
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — ${m.inputPricePerM}/${m.outputPricePerM} за 1M ток.
                </option>
              ))}
            </select>
          )}
          {selectedModel && estCost !== null ? (
            <p className="mt-2 text-xs text-muted">
              {translate(locale, 'ai.step3.estimate', { tokens: estTokens.toLocaleString('ru-RU'), cost: estCost.toFixed(2) })}
              {' · '}
              оценка по прайсу от {PRICING_AS_OF}
            </p>
          ) : null}

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ai.describeAllViaAi} onChange={toggleDescribeAll} />
            {translate(locale, 'ai.describeAll')}
          </label>

          <Card className="mt-4">
            <h3 className="mb-2 text-sm font-medium text-muted">{translate(locale, 'ai.budget.title')}</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm">$</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={ai.budget.limitUsd}
                onChange={(e) => setAiBudget({ limitUsd: Number(e.target.value) })}
                className="w-24 rounded border border-border bg-bg px-2 py-1 font-mono text-sm text-text"
              />
              <select
                value={ai.budget.scope}
                onChange={(e) => setAiBudget({ scope: e.target.value as 'session' | 'day' | 'all-time' })}
                className="rounded border border-border bg-bg px-2 py-1 text-sm text-text"
              >
                <option value="session">{translate(locale, 'ai.budget.scope.session')}</option>
                <option value="day">{translate(locale, 'ai.budget.scope.day')}</option>
                <option value="all-time">{translate(locale, 'ai.budget.scope.allTime')}</option>
              </select>
            </div>
          </Card>
        </section>
      ) : null}

      <div className="flex gap-3">
        <Button variant="primary" onClick={onDone} disabled={!ai.verified || !ai.model}>
          {translate(locale, 'setup.continue')}
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          {translate(locale, 'ai.playWithout')}
        </Button>
      </div>
    </div>
  );
}
