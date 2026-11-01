import { useEffect, useState } from 'react';
import { useGame } from './store.js';
import { UI, SPONSORS } from './texts.js';
import { moveCamera, reducedMotion } from './camera.js';
import { unlockSound, setMuted } from './sound.js';
import { TIME } from './tokens.js';

// Поверх сцены: заголовок, звук, табличка с итогом, аплодисменты, медали, спонсор и панель церемониймейстера.
// Всё, что касается счёта, идёт через store; сцена реагирует на его событие сама.
export default function Overlay() {
  const picked = useGame((s) => s.picked);
  const active = useGame((s) => s.active);
  const players = useGame((s) => s.players);
  const medal = useGame((s) => s.medal);
  const event = useGame((s) => s.event);
  const [muted, setMutedState] = useState(false);
  const [applause, setApplause] = useState(false);
  const [banner, setBanner] = useState(null);
  const [sponsor] = useState(() => SPONSORS[Math.floor(Math.random() * SPONSORS.length)]);

  // Первый жест открывает звук: браузер не даст играть раньше
  useEffect(() => {
    const first = () => {
      unlockSound();
      window.removeEventListener('pointerdown', first);
    };
    window.addEventListener('pointerdown', first);
    return () => window.removeEventListener('pointerdown', first);
  }, []);

  // Аплодисменты: сцена шлёт событие после верного ответа, табличка мигает 2.2 с
  useEffect(() => {
    let t;
    const on = () => {
      setApplause(true);
      clearTimeout(t);
      t = setTimeout(() => setApplause(false), 2200);
    };
    window.addEventListener('cx-applause', on);
    return () => {
      window.removeEventListener('cx-applause', on);
      clearTimeout(t);
    };
  }, []);

  // Итог ответа на несколько секунд: «засчитано» или «не одобрено»
  useEffect(() => {
    if (event.kind !== 'correct' && event.kind !== 'wrong') return undefined;
    setBanner(event.kind === 'correct' ? UI.correct : UI.wrong);
    const t = setTimeout(() => setBanner(null), 2400);
    return () => clearTimeout(t);
  }, [event.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Медаль гаснет сама через 3 с
  useEffect(() => {
    if (!medal) return undefined;
    const t = setTimeout(() => useGame.getState().dismissMedal(), TIME.toast * 1000);
    return () => clearTimeout(t);
  }, [medal]);

  const toggleSound = () => {
    unlockSound();
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  const answer = (ok) => useGame.getState().answer(ok);
  const nextPlayer = () => useGame.getState().setActive((active + 1) % players.length);

  return (
    <div className="cx-overlay">
      <header className="cx-head">
        <p className="cx-kicker">{UI.kicker}</p>
        <button
          type="button"
          className={muted ? 'cx-sound is-off' : 'cx-sound'}
          onClick={toggleSound}
          aria-label={UI.soundAria(muted)}
          aria-pressed={!muted}
        >
          <span className="cx-brush" aria-hidden="true" />
          <span>{muted ? UI.soundOff : UI.soundOn}</span>
        </button>
      </header>

      <div className="cx-title-wrap" aria-hidden="true">
        <h1 className="cx-title">{UI.title}</h1>
      </div>

      <p className={applause ? 'cx-applause is-on' : 'cx-applause'} aria-live="polite">{applause ? UI.applause : ''}</p>

      {banner && <p className="cx-banner" role="status">{banner}</p>}

      {medal && (
        <button type="button" className="cx-medal" onClick={() => useGame.getState().dismissMedal()}>
          {medal.text}
        </button>
      )}

      <aside className="cx-panel" aria-label={UI.protoTitle}>
        <p className="cx-panel-title">{UI.protoTitle}</p>
        <p className="cx-panel-hint" aria-live="polite">
          {picked ? UI.pickedToast(picked.theme, picked.value) : UI.pickHint}
        </p>
        <div className="cx-panel-row">
          <button type="button" className="cx-btn" disabled={!picked} onClick={() => answer(true)}>{UI.btnCorrect}</button>
          <button type="button" className="cx-btn cx-btn-ghost" disabled={!picked} onClick={() => answer(false)}>{UI.btnWrong}</button>
        </div>
        <div className="cx-panel-row">
          <button type="button" className="cx-btn cx-btn-ghost" disabled={!!picked} onClick={nextPlayer}>{UI.btnNext}</button>
          <button type="button" className="cx-btn cx-btn-ghost" onClick={() => moveCamera('pedestals')}>{UI.btnPedestals}</button>
          <button type="button" className="cx-btn cx-btn-ghost" onClick={() => moveCamera('skrizhal')}>{UI.btnSkrizhal}</button>
        </div>
        {reducedMotion && <p className="cx-panel-hint">{UI.reducedMotion}</p>}
      </aside>

      <footer className="cx-ticker" aria-hidden="true">
        <p className="cx-ticker-text">{sponsor}</p>
      </footer>

      <div className="cx-fade" aria-hidden="true" />
    </div>
  );
}
