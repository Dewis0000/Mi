import { useCallback } from 'react';
import { useGameStore } from '../../store';
import { translate, countryName } from '../../i18n';
import { WORLD_BIRTHS_PER_SECOND, WORLD_DEATHS_PER_SECOND, worldPopulationNow } from '../../data/worldConstants';
import { survivalChanceToAge, remainingLifeExpectancy, dominantRiskFactor } from '../../engine/mortality';
import { worldIncomePercentile } from '../../lib/worldIncome';
import { NumberTicker } from '../primitives/NumberTicker';
import { Card } from '../primitives/Card';
import { ComparisonCharts } from './ComparisonCharts';

const MILESTONES = [5, 10, 18, 30, 40, 50, 60, 70, 80, 90];

const FACTOR_LABEL_KEY: Record<string, string> = {
  health: 'life.stats.health',
  wealth: 'life.stats.wealth',
  region: 'analytics.risks.title',
  conflict: 'analytics.risks.conflict',
  disabled: 'life.stats.health',
};

function todaySeconds(): number {
  const now = new Date();
  return (now.getTime() - new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime()) / 1000;
}

export function AnalyticsPanel() {
  const locale = useGameStore((s) => s.locale);
  const character = useGameStore((s) => s.character);
  const country = useGameStore((s) => s.country);
  const region = useGameStore((s) => s.region);
  const rarity = useGameStore((s) => s.rarity);
  const sessionStartedAt = useGameStore((s) => s.sessionStartedAt);

  const computePopulation = useCallback((now: number) => worldPopulationNow(now), []);
  const computeBornToday = useCallback(() => Math.round(todaySeconds() * WORLD_BIRTHS_PER_SECOND), []);
  const computeDiedToday = useCallback(() => Math.round(todaySeconds() * WORLD_DEATHS_PER_SECOND), []);
  const computeWhileYouPlayed = useCallback(
    () => Math.round(((Date.now() - (sessionStartedAt ?? Date.now())) / 1000) * WORLD_BIRTHS_PER_SECOND),
    [sessionStartedAt],
  );

  if (!character || !country) return null;

  const nextMilestones = MILESTONES.filter((m) => m > character.ageYears).slice(0, 2);
  const remaining = remainingLifeExpectancy(character, country, region);
  const dominant = dominantRiskFactor(character, country, region);
  const worldPercentile = worldIncomePercentile(country.gdpPerCapita, character.family.incomeDecile);

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{translate(locale, 'analytics.worldNow.title')}</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">{translate(locale, 'analytics.worldNow.population')}</span>
            <NumberTicker compute={computePopulation} />
          </div>
          <div className="flex justify-between">
            <span className="text-muted">{translate(locale, 'analytics.worldNow.bornToday')}</span>
            <NumberTicker compute={computeBornToday} />
          </div>
          <div className="flex justify-between">
            <span className="text-muted">{translate(locale, 'analytics.worldNow.diedToday')}</span>
            <NumberTicker compute={computeDiedToday} />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          {(() => {
            const [before, after] = translate(locale, 'analytics.worldNow.whileYouPlayed', { n: '\u0000' }).split('\u0000');
            return (
              <>
                {before}
                <NumberTicker compute={computeWhileYouPlayed} className="text-xs" />
                {after}
              </>
            );
          })()}
        </p>
      </Card>

      <Card>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{translate(locale, 'analytics.you.title')}</h3>
        <div className="space-y-1 text-sm text-text">
          {rarity?.complete ? (
            <p>{translate(locale, 'analytics.you.probability', { n: rarity.oneInN.toLocaleString('ru-RU') })}</p>
          ) : null}
          <p>{translate(locale, 'analytics.you.oneOfBorn', { n: Math.round(country.birthsPerYear).toLocaleString('ru-RU'), country: countryName(locale, country.name) })}</p>
          <p>
            {translate(locale, 'analytics.you.decile', { decile: character.family.incomeDecile })}
            {', '}
            {worldPercentile}-{locale === 'ru' ? 'й процентиль в мире' : 'th percentile worldwide'}
          </p>
          {rarity?.complete ? <p className="text-xs text-muted">{translate(locale, 'analytics.you.rarity')}: {rarity.tier}</p> : null}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{translate(locale, 'analytics.chances.title')}</h3>
        <div className="space-y-1 font-mono text-sm text-text">
          <p>{translate(locale, 'analytics.chances.nextBirthday', { pct: (survivalChanceToAge(character, country, region, character.ageYears + 1) * 100).toFixed(1) })}</p>
          {nextMilestones.map((m) => (
            <p key={m}>{translate(locale, 'analytics.chances.toAge', { age: m, pct: (survivalChanceToAge(character, country, region, m) * 100).toFixed(1) })}</p>
          ))}
          <p>{translate(locale, 'analytics.chances.remaining', { years: remaining.toFixed(1) })}</p>
        </div>
        <p className="mt-2 text-xs text-muted">
          {translate(locale, 'analytics.chances.dominantFactor', {
            factor: translate(locale, FACTOR_LABEL_KEY[dominant.label] ?? 'life.stats.health'),
            detail: `×${dominant.multiplier.toFixed(2)}`,
          })}
        </p>
      </Card>

      <Card>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{translate(locale, 'analytics.comparison.title')}</h3>
        <ComparisonCharts />
      </Card>

      <Card>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{translate(locale, 'analytics.risks.title')}</h3>
        <div className="space-y-1 text-sm text-text">
          <div className="flex justify-between">
            <span className="text-muted">{translate(locale, 'analytics.risks.homicide')}</span>
            <span className="font-mono">{country.homicideRate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">{translate(locale, 'analytics.risks.conflict')}</span>
            <span className="font-mono">{country.conflictIndex.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">{translate(locale, 'analytics.risks.infantMortality')}</span>
            <span className="font-mono">{country.infantMortality}‰</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">{translate(locale, 'analytics.risks.schooling')}</span>
            <span className="font-mono">{country.schoolingYears}</span>
          </div>
          {region && region.hazards.length > 0 ? (
            <p className="text-xs text-muted">
              {translate(locale, 'analytics.risks.hazards')}: {region.hazards.join(', ')}
            </p>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted">{translate(locale, 'analytics.risks.disclaimer')}</p>
      </Card>
    </div>
  );
}
