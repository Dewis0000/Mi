import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store';
import { translate } from '../../i18n';
import { Button } from '../primitives/Button';
import { StatBar } from '../primitives/StatBar';
import { Modal } from '../primitives/Modal';
import { AnalyticsPanel } from './AnalyticsPanel';
import { TokenPanel } from './TokenPanel';
import { ChoiceModal } from './ChoiceModal';
import type { GameSpeed } from '../../types';

type MobileTab = 'life' | 'stats' | 'analytics';

export function LifeScreen() {
  const locale = useGameStore((s) => s.locale);
  const character = useGameStore((s) => s.character);
  const timeline = useGameStore((s) => s.timeline);
  const clock = useGameStore((s) => s.clock);
  const phase = useGameStore((s) => s.phase);
  const ai = useGameStore((s) => s.ai);
  const togglePause = useGameStore((s) => s.togglePause);
  const setSpeedPreference = useGameStore((s) => s.setSpeedPreference);
  const quitAndForget = useGameStore((s) => s.quitAndForget);
  const dismissDegraded = useGameStore((s) => s.dismissDegraded);

  const [tab, setTab] = useState<MobileTab>('life');
  const [confirmQuit, setConfirmQuit] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [timeline.length]);

  // Пауза на пробел (раздел 17) — не на развилке: там пробел не должен
  // перехватывать фокус у кнопок/модалки выбора.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;
      if (e.code === 'Space' && phase === 'alive') {
        e.preventDefault();
        togglePause();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [phase, togglePause]);

  if (!character || !clock) return null;

  const minutesElapsed = Math.floor(clock.secondsElapsed / 60);
  const minutesTotal = Math.floor(clock.sessionSeconds / 60);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-3 py-2 sm:px-4">
        <div className="font-mono text-xs text-muted">
          {minutesElapsed}:{String(Math.floor(clock.secondsElapsed % 60)).padStart(2, '0')} / {minutesTotal}:00
        </div>
        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          {([1, 2, 4] as GameSpeed[]).map((sp) => (
            <button
              key={sp}
              onClick={() => setSpeedPreference(sp)}
              className={`rounded px-2 py-1 font-mono text-xs ${clock.speed === sp ? 'bg-accent text-bg' : 'text-muted hover:text-text'}`}
            >
              ×{sp}
            </button>
          ))}
          <Button variant="ghost" className="whitespace-nowrap px-2 sm:px-4" onClick={togglePause}>
            {clock.paused && phase === 'alive' ? translate(locale, 'life.resume') : translate(locale, 'life.pause')}
          </Button>
          <Button
            variant="ghost"
            className="whitespace-nowrap px-2 sm:px-4"
            onClick={() => setConfirmQuit(true)}
            aria-label={translate(locale, 'life.quit')}
          >
            <span className="sm:hidden">✕</span>
            <span className="hidden sm:inline">{translate(locale, 'life.quit')}</span>
          </Button>
        </div>
      </header>

      {clock.acceleratedRemainder ? (
        <div className="bg-accent/10 px-4 py-1 text-center text-xs text-accent">{translate(locale, 'life.accelerated.banner')}</div>
      ) : null}
      {ai.degraded ? (
        <div className="flex items-center justify-center gap-3 bg-down/10 px-4 py-1 text-center text-xs text-down">
          <span>{translate(locale, 'ai.degraded.banner')}</span>
          <button className="underline" onClick={dismissDegraded}>
            {translate(locale, 'ai.degraded.fix')}
          </button>
        </div>
      ) : null}

      <div className="flex gap-2 border-b border-border px-4 py-2 text-xs lg:hidden">
        {(['life', 'stats', 'analytics'] as MobileTab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded px-2 py-1 ${tab === t ? 'bg-accent text-bg' : 'text-muted'}`}>
            {t === 'life' ? translate(locale, 'life.tab.life') : t === 'stats' ? translate(locale, 'life.tab.stats') : translate(locale, 'life.tab.analytics')}
          </button>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[220px_1fr_300px]">
        <aside className={`${tab === 'stats' ? 'block' : 'hidden'} lg:block`}>
          <div className="mb-4 text-center">
            <p className="font-mono text-4xl text-accent" aria-live="polite">
              {character.ageYears}
            </p>
            <p className="text-xs text-muted">{translate(locale, 'life.age')}</p>
          </div>
          <StatBar label={translate(locale, 'life.stats.health')} value={character.stats.health} />
          <StatBar label={translate(locale, 'life.stats.wealth')} value={character.stats.wealth} />
          <StatBar label={translate(locale, 'life.stats.education')} value={character.stats.education} />
          <StatBar label={translate(locale, 'life.stats.bonds')} value={character.stats.bonds} />
          <StatBar label={translate(locale, 'life.stats.standing')} value={character.stats.standing} />
        </aside>

        <main className={`${tab === 'life' ? 'block' : 'hidden'} lg:block`}>
          <div ref={feedRef} className="h-[70vh] space-y-3 overflow-y-auto pr-2">
            {timeline.map((e) => (
              <div key={e.id} className="animate-rise-in rounded border border-border bg-card p-3">
                <div className="mb-1 flex items-center justify-between text-xs text-muted">
                  <span className="font-mono">{e.year} · {e.age} лет</span>
                  {e.source === 'offline' ? <span className="rounded border border-border px-1.5 py-0.5 text-[10px]">{translate(locale, 'life.offlineTag')}</span> : null}
                </div>
                <p className="mb-1 text-sm font-medium text-text">{e.title}</p>
                <p className="text-sm text-muted">{e.body}</p>
                {e.resolvedBy === 'timeout' ? <p className="mt-1 text-[10px] text-muted">{translate(locale, 'choice.resolvedByTimeout')}</p> : null}
              </div>
            ))}
          </div>
        </main>

        <aside className={`${tab === 'analytics' ? 'block' : 'hidden'} space-y-4 lg:block`}>
          <TokenPanel />
          <AnalyticsPanel />
        </aside>
      </div>

      {phase === 'choice' ? <ChoiceModal /> : null}

      {confirmQuit ? (
        <Modal title={translate(locale, 'life.quit.confirm.title')} onClose={() => setConfirmQuit(false)}>
          <p className="mb-6 text-sm text-muted">{translate(locale, 'life.quit.confirm.body')}</p>
          <div className="flex gap-3">
            <Button variant="danger" onClick={quitAndForget}>
              {translate(locale, 'life.quit.confirm.ok')}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmQuit(false)}>
              {translate(locale, 'life.quit.confirm.cancel')}
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
