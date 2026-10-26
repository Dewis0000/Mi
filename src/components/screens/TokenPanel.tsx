import { useEffect, useState } from 'react';
import { useGameStore } from '../../store';
import { translate } from '../../i18n';
import { DEFAULT_MODELS, PRICING_AS_OF } from '../../ai/providers';
import { listLifeLogEntries } from '../../store/journalDb';
import { Card } from '../primitives/Card';

const BASELINE_TOKENS_PER_LIFE = 20_000;

export function TokenPanel() {
  const locale = useGameStore((s) => s.locale);
  const ai = useGameStore((s) => s.ai);
  const session = useGameStore((s) => s.session);
  const [collapsed, setCollapsed] = useState(false);
  const [avgCostPerLife, setAvgCostPerLife] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    void listLifeLogEntries().then((entries) => {
      if (!mounted) return;
      const withSpend = entries.filter((e) => e.tokensIn > 0 || e.tokensOut > 0);
      if (withSpend.length === 0) {
        setAvgCostPerLife(null);
        return;
      }
      setAvgCostPerLife(withSpend.reduce((s, e) => s + e.costUsd, 0) / withSpend.length);
    });
    return () => {
      mounted = false;
    };
  }, [ai.thisLifeCostUsd]);

  if (!ai.provider || !ai.model) return null;
  const model = DEFAULT_MODELS[ai.provider]?.find((m) => m.id === ai.model);

  const sessionMinutes = session ? session.sessionSeconds / 60 : 30;
  const fallbackCost = model ? (BASELINE_TOKENS_PER_LIFE * (sessionMinutes / 30) * 0.77 * model.inputPricePerM) / 1_000_000 : 0;
  const costPerLife = avgCostPerLife ?? fallbackCost;
  const remainingBudget = Math.max(ai.budget.limitUsd - ai.budget.spentUsd, 0);
  const remainingLives = costPerLife > 0 ? remainingBudget / costPerLife : 0;
  const spentRatio = ai.budget.limitUsd > 0 ? Math.min(ai.budget.spentUsd / ai.budget.limitUsd, 1) : 1;

  return (
    <Card>
      <button className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted" onClick={() => setCollapsed((v) => !v)}>
        <span>
          {translate(locale, 'analytics.tokens.title')} · {model?.label ?? ai.model}
        </span>
        <span>{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed ? (
        <div className="space-y-2 text-sm">
          <div>
            <div className="flex justify-between font-mono">
              <span className="text-muted">{translate(locale, 'analytics.tokens.thisLife')}</span>
              <span>
                {(ai.thisLifeTokensIn + ai.thisLifeTokensOut).toLocaleString('ru-RU')} ток. ≈ ${ai.thisLifeCostUsd.toFixed(3)}
              </span>
            </div>
            <div className="flex justify-between pl-3 text-xs text-muted">
              <span>{translate(locale, 'analytics.tokens.input')}</span>
              <span>{ai.thisLifeTokensIn.toLocaleString('ru-RU')}</span>
            </div>
            <div className="flex justify-between pl-3 text-xs text-muted">
              <span>{translate(locale, 'analytics.tokens.output')}</span>
              <span>{ai.thisLifeTokensOut.toLocaleString('ru-RU')}</span>
            </div>
          </div>

          <div className="flex justify-between font-mono">
            <span className="text-muted">{translate(locale, 'analytics.tokens.total')}</span>
            <span>
              {(ai.budget.spentTokensIn + ai.budget.spentTokensOut).toLocaleString('ru-RU')} ток. ≈ ${ai.budget.spentUsd.toFixed(2)}
            </span>
          </div>

          <div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-border">
              <div
                className={`h-full rounded ${spentRatio >= 0.9 ? 'bg-down' : spentRatio >= 0.75 ? 'bg-accent' : 'bg-up'}`}
                style={{ width: `${spentRatio * 100}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              {translate(locale, 'ai.budget.title')} {Math.round(spentRatio * 100)}% {locale === 'ru' ? 'из' : 'of'} ${ai.budget.limitUsd}
            </p>
          </div>

          <p className="text-xs text-muted">{translate(locale, 'analytics.tokens.remaining', { n: remainingLives.toFixed(1) })}</p>
          {ai.lastCallTokens ? (
            <p className="text-xs text-muted">
              {translate(locale, 'analytics.tokens.last', { tokens: ai.lastCallTokens, seconds: ((ai.lastCallMs ?? 0) / 1000).toFixed(1) })}
            </p>
          ) : null}
          <p className="text-[10px] text-muted">{locale === 'ru' ? 'оценка по прайсу от' : 'pricing estimate as of'} {PRICING_AS_OF}</p>
        </div>
      ) : null}
    </Card>
  );
}
