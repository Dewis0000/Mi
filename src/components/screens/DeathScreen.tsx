import { useEffect, useState } from 'react';
import { useGameStore } from '../../store';
import { translate, countryName, ruYearsWord } from '../../i18n';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';

export function DeathScreen() {
  const locale = useGameStore((s) => s.locale);
  const character = useGameStore((s) => s.character);
  const country = useGameStore((s) => s.country);
  const region = useGameStore((s) => s.region);
  const causeOfDeath = useGameStore((s) => s.causeOfDeath);
  const continueToEpilogue = useGameStore((s) => s.continueToEpilogue);
  const [showContinue, setShowContinue] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowContinue(true), 3000);
    return () => clearTimeout(t);
  }, []);

  if (!character || !country) return null;

  const place = region ? `${countryName(locale, region.name)}, ${countryName(locale, country.name)}` : countryName(locale, country.name);
  const year = character.birthYear + character.ageYears;
  const cause = causeOfDeath?.label[locale] ?? causeOfDeath?.label.ru ?? '—';
  const ageWord = locale === 'ru' ? ruYearsWord(character.ageYears) : character.ageYears === 1 ? 'year' : 'years';
  const genderSuffix = locale === 'ru' && character.sex === 'female' ? 'ла' : '';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Card className="w-full max-w-md grayscale">
        <p className="text-sm text-muted">
          {translate(locale, 'death.summary', { age: character.ageYears, ageWord, year, place, cause, genderSuffix })}
        </p>
      </Card>
      <div className="mt-8 h-10">
        {showContinue ? (
          <Button variant="primary" onClick={continueToEpilogue}>
            {translate(locale, 'death.continue')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
