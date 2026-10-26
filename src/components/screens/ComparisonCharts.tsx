import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useGameStore } from '../../store';
import { translate } from '../../i18n';
import { lifeTable } from '../../engine/lifetable';
import type { Character, Country } from '../../types';

type View = 'survival' | 'radar' | 'trajectory';

function cohortSurvivalSeries(country: Country, sex: Character['sex']) {
  const points: Array<{ age: number; survival: number }> = [];
  let survival = 1;
  for (let age = 0; age <= 95; age++) {
    points.push({ age, survival: Math.round(survival * 1000) / 10 });
    const qx = lifeTable(country.iso3, sex, age, country);
    survival *= 1 - qx;
  }
  return points;
}

const AXIS_COLOR = '#8A9099';
const GRID_COLOR = '#232830';

export function ComparisonCharts() {
  const locale = useGameStore((s) => s.locale);
  const character = useGameStore((s) => s.character);
  const country = useGameStore((s) => s.country);
  const statsHistory = useGameStore((s) => s.statsHistory);
  const [view, setView] = useState<View>('survival');

  const survivalSeries = useMemo(() => (country && character ? cohortSurvivalSeries(country, character.sex) : []), [country, character?.sex]);

  if (!character || !country) return null;

  const radarData = [
    { stat: translate(locale, 'life.stats.health'), you: character.stats.health, median: 50 },
    { stat: translate(locale, 'life.stats.wealth'), you: character.stats.wealth, median: 50 },
    { stat: translate(locale, 'life.stats.education'), you: character.stats.education, median: 50 },
    { stat: translate(locale, 'life.stats.bonds'), you: character.stats.bonds, median: 50 },
    { stat: translate(locale, 'life.stats.standing'), you: character.stats.standing, median: 50 },
  ];

  return (
    <div>
      <div className="mb-2 flex gap-2 text-xs">
        {(['survival', 'radar', 'trajectory'] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded border px-2 py-1 ${view === v ? 'border-accent text-accent' : 'border-border text-muted'}`}
          >
            {translate(locale, `analytics.comparison.${v === 'survival' ? 'survival' : v === 'radar' ? 'radar' : 'trajectory'}`)}
          </button>
        ))}
      </div>

      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer>
          {view === 'survival' ? (
            <LineChart data={survivalSeries}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="age" stroke={AXIS_COLOR} tick={{ fontSize: 10 }} />
              <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 10 }} width={32} />
              <Tooltip contentStyle={{ background: '#14171C', border: '1px solid #232830', fontSize: 12 }} />
              <Line type="monotone" dataKey="survival" stroke="#D9A441" dot={false} strokeWidth={2} />
            </LineChart>
          ) : view === 'radar' ? (
            <RadarChart data={radarData}>
              <PolarGrid stroke={GRID_COLOR} />
              <PolarAngleAxis dataKey="stat" tick={{ fontSize: 10, fill: AXIS_COLOR }} />
              <Radar dataKey="median" stroke="#8A9099" fill="#8A9099" fillOpacity={0.15} />
              <Radar dataKey="you" stroke="#D9A441" fill="#D9A441" fillOpacity={0.3} />
              <Tooltip contentStyle={{ background: '#14171C', border: '1px solid #232830', fontSize: 12 }} />
            </RadarChart>
          ) : (
            <LineChart data={statsHistory}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="age" stroke={AXIS_COLOR} tick={{ fontSize: 10 }} />
              <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 10 }} width={32} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: '#14171C', border: '1px solid #232830', fontSize: 12 }} />
              <Line type="monotone" dataKey="wealth" stroke="#D9A441" dot={false} strokeWidth={2} name={translate(locale, 'life.stats.wealth')} />
              <Line type="monotone" dataKey="health" stroke="#5A8F6B" dot={false} strokeWidth={2} name={translate(locale, 'life.stats.health')} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
