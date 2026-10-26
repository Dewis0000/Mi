import { useRef, useState } from 'react';
import { useGameStore } from '../../store';
import { translate, countryName } from '../../i18n';
import { worldMedianLifeExpectancy, worldMedianSchoolingYears, worldMedianExpectedChildren, countryAverageExpectedChildren } from '../../lib/worldMedians';
import { clamp } from '../../engine/rng';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';

function peakWealthToDecile(peakWealth: number): number {
  return clamp(Math.round((peakWealth * 9) / 100) + 1, 1, 10);
}

export function EpilogueScreen() {
  const locale = useGameStore((s) => s.locale);
  const character = useGameStore((s) => s.character);
  const country = useGameStore((s) => s.country);
  const region = useGameStore((s) => s.region);
  const causeOfDeath = useGameStore((s) => s.causeOfDeath);
  const epilogueText = useGameStore((s) => s.epilogueText);
  const timeline = useGameStore((s) => s.timeline);
  const statsHistory = useGameStore((s) => s.statsHistory);
  const rarity = useGameStore((s) => s.rarity);
  const liveAnotherOne = useGameStore((s) => s.liveAnotherOne);
  const liveSameSeed = useGameStore((s) => s.liveSameSeed);
  const goToJournal = useGameStore((s) => s.goToJournal);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  if (!character || !country) return null;

  const peakWealth = Math.max(...statsHistory.map((h) => h.wealth), character.stats.wealth);
  const peakDecile = peakWealthToDecile(peakWealth);
  const countryChildrenMedian = countryAverageExpectedChildren(country.traditionPacks);

  const rows = [
    { label: translate(locale, 'epilogue.numbers.yearsLived'), you: character.ageYears, country: country.lifeExpectancy[character.sex].toFixed(1), world: worldMedianLifeExpectancy().toFixed(1) },
    { label: translate(locale, 'epilogue.numbers.yearsEducation'), you: Math.round((character.stats.education / 100) * 20), country: country.schoolingYears.toFixed(1), world: worldMedianSchoolingYears().toFixed(1) },
    { label: translate(locale, 'epilogue.numbers.children'), you: character.childrenCount, country: countryChildrenMedian.toFixed(1), world: worldMedianExpectedChildren().toFixed(1) },
    { label: translate(locale, 'epilogue.numbers.peakDecile'), you: peakDecile, country: '5.5', world: '—' },
  ];

  const choiceEvents = timeline.filter((e) => e.choices && e.choices.length > 0);

  function handleShare(): void {
    const canvas = canvasRef.current;
    if (!canvas || !character || !country) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = 800;
    canvas.height = 450;
    ctx.fillStyle = '#0B0D10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#232830';
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
    ctx.fillStyle = '#D9A441';
    ctx.font = '28px monospace';
    ctx.fillText(translate(locale, 'app.title'), 50, 80);
    ctx.fillStyle = '#E8EAED';
    ctx.font = '20px monospace';
    const place = region ? `${countryName(locale, region.name)}, ${countryName(locale, country.name)}` : countryName(locale, country.name);
    ctx.fillText(place, 50, 130);
    ctx.fillText(`${character.birthYear} — ${character.birthYear + character.ageYears} (${character.ageYears})`, 50, 165);
    ctx.fillStyle = '#8A9099';
    ctx.font = '16px monospace';
    ctx.fillText(causeOfDeath?.label[locale] ?? '', 50, 200);
    if (rarity?.complete) {
      ctx.fillText(`1 / ${rarity.oneInN.toLocaleString('ru-RU')} · ${rarity.tier}`, 50, 230);
    }
    ctx.fillText(`seed: ${character.seed}`, 50, 400);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${character.seed}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });

    const text = `${place} · ${character.ageYears} ${locale === 'ru' ? 'лет' : 'years'} · seed ${character.seed}`;
    void navigator.clipboard?.writeText(text).then(() => {
      setShareMsg(translate(locale, 'epilogue.share.copied'));
      setTimeout(() => setShareMsg(null), 2000);
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-text">
      <h1 className="mb-6 text-xl font-semibold">{translate(locale, 'epilogue.title')}</h1>

      <Card className="mb-6">
        <p className="text-sm leading-relaxed text-text">{epilogueText}</p>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{translate(locale, 'epilogue.lifeCard.title')}</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted">{translate(locale, 'epilogue.lifeCard.years')}</dt>
          <dd className="font-mono">{character.birthYear}–{character.birthYear + character.ageYears} ({character.ageYears})</dd>
          <dt className="text-muted">{translate(locale, 'epilogue.lifeCard.place')}</dt>
          <dd>{region ? `${countryName(locale, region.name)}, ` : ''}{countryName(locale, country.name)}</dd>
          <dt className="text-muted">{translate(locale, 'epilogue.lifeCard.children')}</dt>
          <dd className="font-mono">{character.childrenCount}</dd>
          <dt className="text-muted">{translate(locale, 'epilogue.lifeCard.died')}</dt>
          <dd>{causeOfDeath?.label[locale] ?? '—'}</dd>
          <dt className="text-muted">{translate(locale, 'epilogue.lifeCard.seed')}</dt>
          <dd className="font-mono text-xs">{character.seed}</dd>
        </dl>
      </Card>

      <Card className="mb-6 overflow-x-auto">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{translate(locale, 'epilogue.numbers.title')}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2">{translate(locale, 'epilogue.numbers.metric')}</th>
              <th className="pb-2 text-accent">{translate(locale, 'epilogue.numbers.you')}</th>
              <th className="pb-2">{translate(locale, 'epilogue.numbers.countryMedian')}</th>
              <th className="pb-2">{translate(locale, 'epilogue.numbers.worldMedian')}</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border">
                <td className="py-1 font-sans text-muted">{r.label}</td>
                <td className="py-1 text-accent">{r.you}</td>
                <td className="py-1">{r.country}</td>
                <td className="py-1">{r.world}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {choiceEvents.length > 0 ? (
        <Card className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{translate(locale, 'epilogue.choices.title')}</h2>
          <ul className="space-y-1 text-sm">
            {choiceEvents.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span>{e.title}</span>
                {e.resolvedBy === 'timeout' ? <span className="text-xs text-muted">{translate(locale, 'epilogue.choices.timeout')}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <canvas ref={canvasRef} className="hidden" />

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={handleShare}>
          {shareMsg ?? translate(locale, 'epilogue.share')}
        </Button>
        <Button variant="primary" onClick={liveAnotherOne}>
          {translate(locale, 'epilogue.again')}
        </Button>
        <Button variant="secondary" onClick={liveSameSeed}>
          {translate(locale, 'epilogue.sameSeed')}
        </Button>
        <Button variant="ghost" onClick={goToJournal}>
          {translate(locale, 'epilogue.toJournal')}
        </Button>
      </div>
    </div>
  );
}
