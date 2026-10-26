import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useGameStore } from '../../store';
import { translate, countryName } from '../../i18n';
import { getCountry, causeLabel } from '../../data';
import { clearJournal, exportJournal, importJournal, listLifeLogEntries } from '../../store/journalDb';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import type { LifeLogEntry } from '../../types';

export function JournalScreen() {
  const locale = useGameStore((s) => s.locale);
  const goToMenu = useGameStore((s) => s.goToMenu);
  const updateSetupDraft = useGameStore((s) => s.updateSetupDraft);
  const startNewLife = useGameStore((s) => s.startNewLife);
  const [entries, setEntries] = useState<LifeLogEntry[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh(): Promise<void> {
    setEntries(await listLifeLogEntries());
  }

  useEffect(() => {
    void refresh();
  }, []);

  const spendByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const day = new Date(e.createdAt).toISOString().slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + e.costUsd);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([day, cost]) => ({ day: day.slice(5), cost: Math.round(cost * 1000) / 1000 }));
  }, [entries]);

  function replaySeed(seed: string): void {
    updateSetupDraft({ seed, birthMode: 'random', countryIso3: undefined, regionId: undefined });
    startNewLife();
  }

  async function handleExport(): Promise<void> {
    const json = await exportJournal();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File): Promise<void> {
    const text = await file.text();
    await importJournal(text);
    await refresh();
  }

  async function handleClear(): Promise<void> {
    if (!window.confirm(translate(locale, 'journal.clear.confirm'))) return;
    await clearJournal();
    await refresh();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 text-text">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{translate(locale, 'journal.title')}</h1>
        <Button variant="ghost" onClick={goToMenu}>
          {translate(locale, 'setup.back')}
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted">{translate(locale, 'journal.empty')}</p>
      ) : (
        <Card className="mb-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2">{translate(locale, 'journal.col.country')}</th>
                <th className="pb-2">{translate(locale, 'journal.col.years')}</th>
                <th className="pb-2">{translate(locale, 'journal.col.ageAtDeath')}</th>
                <th className="pb-2">{translate(locale, 'journal.col.cause')}</th>
                <th className="pb-2">{translate(locale, 'journal.col.tokens')}</th>
                <th className="pb-2">{translate(locale, 'journal.col.cost')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const country = getCountry(e.countryIso3);
                return (
                  <Fragment key={e.id}>
                    <tr
                      className="cursor-pointer border-t border-border hover:bg-border/30"
                      onClick={() => setExpanded(expanded === e.id ? null : (e.id ?? null))}
                    >
                      <td className="py-1.5">{countryName(locale, country.name)}{e.interrupted ? ' ·⚠' : ''}</td>
                      <td className="py-1.5 font-mono">{e.birthYear}{e.deathYear ? `–${e.deathYear}` : ''}</td>
                      <td className="py-1.5 font-mono">{e.ageAtDeath ?? '—'}</td>
                      <td className="py-1.5">{causeLabel(e.causeOfDeath, locale)}</td>
                      <td className="py-1.5 font-mono">{(e.tokensIn + e.tokensOut).toLocaleString('ru-RU')}</td>
                      <td className="py-1.5 font-mono">${e.costUsd.toFixed(3)}</td>
                    </tr>
                    {expanded === e.id ? (
                      <tr className="border-t border-border bg-border/10">
                        <td colSpan={6} className="py-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs text-muted">{translate(locale, 'journal.col.seed')}: {e.seed}</span>
                            <Button variant="secondary" onClick={() => replaySeed(e.seed)}>
                              {translate(locale, 'journal.replaySeed')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {spendByDay.length > 0 ? (
        <Card className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{translate(locale, 'journal.spendChart.title')}</h2>
          <div style={{ width: '100%', height: 160 }}>
            <ResponsiveContainer>
              <BarChart data={spendByDay}>
                <CartesianGrid stroke="#232830" vertical={false} />
                <XAxis dataKey="day" stroke="#8A9099" tick={{ fontSize: 10 }} />
                <YAxis stroke="#8A9099" tick={{ fontSize: 10 }} width={40} />
                <Tooltip contentStyle={{ background: '#14171C', border: '1px solid #232830', fontSize: 12 }} />
                <Bar dataKey="cost" fill="#D9A441" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={handleExport}>
          {translate(locale, 'journal.export')}
        </Button>
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
          {translate(locale, 'journal.import')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
            e.target.value = '';
          }}
        />
        <Button variant="danger" onClick={handleClear}>
          {translate(locale, 'journal.clear')}
        </Button>
      </div>
    </div>
  );
}
