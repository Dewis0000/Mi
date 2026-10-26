import { useMemo, useState } from 'react';
import { useGameStore } from '../../store';
import { translate, countryName } from '../../i18n';
import { countries, getRegionsFor } from '../../data';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import type { BirthMode, SessionLength } from '../../types';

const LENGTHS: SessionLength[] = ['short', 'normal', 'long'];
const MODES: BirthMode[] = ['random', 'country', 'region'];

export function SetupScreen({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const locale = useGameStore((s) => s.locale);
  const draft = useGameStore((s) => s.setupDraft);
  const updateSetupDraft = useGameStore((s) => s.updateSetupDraft);
  const [countryQuery, setCountryQuery] = useState('');

  const filteredCountries = useMemo(() => {
    if (countryQuery.trim().length === 0) return countries.slice(0, 8);
    const q = countryQuery.toLowerCase();
    return countries.filter((c) => countryName(locale, c.name).toLowerCase().includes(q)).slice(0, 8);
  }, [countryQuery, locale]);

  const selectedCountry = countries.find((c) => c.iso3 === draft.countryIso3) ?? null;
  const regionsForCountry = selectedCountry ? getRegionsFor(selectedCountry.iso3) : [];

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 text-text">
      <h1 className="mb-6 text-xl font-semibold">{translate(locale, 'setup.title')}</h1>

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-medium text-muted">{translate(locale, 'setup.length.title')}</h2>
        <p className="mb-3 text-xs text-muted">{translate(locale, 'setup.length.caption')}</p>
        <div className="grid grid-cols-3 gap-3">
          {LENGTHS.map((len) => (
            <button
              key={len}
              onClick={() => updateSetupDraft({ length: len })}
              className={`rounded border px-3 py-4 text-sm transition-colors ${
                draft.length === len ? 'border-accent text-accent' : 'border-border hover:border-accent/50'
              }`}
            >
              {translate(locale, `setup.length.${len}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-muted">{translate(locale, 'setup.mode.title')}</h2>
        <div className="space-y-2">
          {MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => updateSetupDraft({ birthMode: mode, countryIso3: mode === 'random' ? undefined : draft.countryIso3, regionId: mode === 'region' ? draft.regionId : undefined })}
              className={`block w-full rounded border px-4 py-3 text-left transition-colors ${
                draft.birthMode === mode ? 'border-accent' : 'border-border hover:border-accent/50'
              }`}
            >
              <div className="text-sm">{translate(locale, `setup.mode.${mode}`)}</div>
              <div className="text-xs text-muted">{translate(locale, `setup.mode.${mode}.caption`)}</div>
            </button>
          ))}
        </div>

        {draft.birthMode !== 'random' ? (
          <Card className="mt-3">
            <input
              type="text"
              value={countryQuery}
              onChange={(e) => setCountryQuery(e.target.value)}
              placeholder={translate(locale, 'setup.country.search')}
              className="mb-2 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
            />
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {filteredCountries.map((c) => (
                <button
                  key={c.iso3}
                  onClick={() => updateSetupDraft({ countryIso3: c.iso3, regionId: undefined })}
                  className={`block w-full rounded px-2 py-1 text-left text-sm ${
                    draft.countryIso3 === c.iso3 ? 'bg-accent/20 text-accent' : 'hover:bg-border/40'
                  }`}
                >
                  {countryName(locale, c.name)}
                </button>
              ))}
            </div>

            {draft.birthMode === 'region' && selectedCountry ? (
              <div className="mt-3 border-t border-border pt-3">
                {regionsForCountry.length === 0 ? (
                  <p className="text-xs text-muted">{translate(locale, 'setup.region.none')}</p>
                ) : (
                  <div className="space-y-1">
                    {regionsForCountry.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => updateSetupDraft({ regionId: r.id })}
                        className={`block w-full rounded px-2 py-1 text-left text-sm ${
                          draft.regionId === r.id ? 'bg-accent/20 text-accent' : 'hover:bg-border/40'
                        }`}
                      >
                        {countryName(locale, r.name)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </Card>
        ) : null}

        {draft.birthMode !== 'random' ? <p className="mt-3 text-xs text-accent/80">{translate(locale, 'setup.warning.manual')}</p> : null}
      </section>

      <section className="mb-8">
        <label className="mb-1 block text-sm font-medium text-muted">{translate(locale, 'setup.seed.label')}</label>
        <input
          type="text"
          value={draft.seed ?? ''}
          onChange={(e) => updateSetupDraft({ seed: e.target.value })}
          placeholder={translate(locale, 'setup.seed.placeholder')}
          className="w-full rounded border border-border bg-bg px-3 py-2 font-mono text-sm text-text"
        />
      </section>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onBack}>
          {translate(locale, 'setup.back')}
        </Button>
        <Button variant="primary" onClick={onNext} disabled={draft.birthMode === 'region' && !!selectedCountry && regionsForCountry.length > 0 && !draft.regionId}>
          {translate(locale, 'setup.continue')}
        </Button>
      </div>
    </div>
  );
}
