import { useEffect, useState } from 'react';
import { useGameStore } from '../../store';
import { translate, countryName } from '../../i18n';
import { getTradition } from '../../data';
import { survivalChanceToAge } from '../../engine/mortality';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';

function usesReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function BirthScreen() {
  const locale = useGameStore((s) => s.locale);
  const character = useGameStore((s) => s.character);
  const country = useGameStore((s) => s.country);
  const region = useGameStore((s) => s.region);
  const rarity = useGameStore((s) => s.rarity);
  const confirmBirthAndLive = useGameStore((s) => s.confirmBirthAndLive);
  const [revealed, setRevealed] = useState(usesReducedMotion());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (revealed) return;
    const t = setTimeout(() => setRevealed(true), 2600);
    return () => clearTimeout(t);
  }, [revealed]);

  if (!character || !country) return null;

  const pack = getTradition(character.family.traditionPackId);
  const lifeExpectancy = country.lifeExpectancy[character.sex];
  const survive5 = Math.round(survivalChanceToAge(character, country, region, 5) * 1000) / 10;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      {!revealed ? (
        <div className="text-center text-muted">
          <p className="animate-pulse font-mono text-sm">
            {translate(locale, 'app.title')} → {countryName(locale, country.name)}
            {region ? ` → ${countryName(locale, region.name)}` : ''}
          </p>
        </div>
      ) : (
        <Card className="w-full max-w-md animate-rise-in text-center">
          <h1 className="mb-1 text-lg font-semibold">{character.name}</h1>
          <p className="mb-4 text-sm text-muted">
            {countryName(locale, country.name)}
            {region ? `, ${countryName(locale, region.name)}` : ''} ·{' '}
            {translate(locale, character.sex === 'male' ? 'common.male' : 'common.female')}
          </p>

          <div className="mb-4 space-y-1 text-left text-sm">
            <p>
              <span className="text-muted">{translate(locale, 'birth.family.wealthDecile', { decile: character.family.incomeDecile })}</span>
            </p>
            <p className="text-muted">
              {translate(locale, character.family.rural ? 'birth.family.rural' : 'birth.family.urban')} · {pack.label[locale]}
            </p>
          </div>

          <div className="mb-6 space-y-1 border-t border-border pt-4 text-left font-mono text-xs text-muted">
            {rarity?.complete ? (
              <p>{translate(locale, 'birth.probability', { n: rarity.oneInN.toLocaleString('ru-RU') })}</p>
            ) : (
              <p>{translate(locale, 'birth.rarity.incomplete')}</p>
            )}
            <p>{translate(locale, 'birth.lifeExpectancy', { years: lifeExpectancy.toFixed(1) })}</p>
            <p>{translate(locale, 'birth.survive5', { pct: survive5 })}</p>
          </div>

          <button
            className="mb-4 text-xs text-muted underline"
            onClick={() => {
              void navigator.clipboard?.writeText(character.seed).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? translate(locale, 'birth.seed.copied') : `${translate(locale, 'birth.seed.copy')}: ${character.seed}`}
          </button>

          <Button variant="primary" className="w-full" onClick={confirmBirthAndLive}>
            {translate(locale, 'birth.cta')}
          </Button>
        </Card>
      )}
    </div>
  );
}
