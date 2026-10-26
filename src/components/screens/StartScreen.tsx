import { useCallback, useState } from 'react';
import { useGameStore } from '../../store';
import { translate } from '../../i18n';
import { worldPopulationNow } from '../../data/worldConstants';
import { NumberTicker } from '../primitives/NumberTicker';
import { Button } from '../primitives/Button';
import { AboutDataModal } from './AboutDataModal';
import { AiSetupScreen } from './AiSetupScreen';

export function StartScreen() {
  const locale = useGameStore((s) => s.locale);
  const goToSetup = useGameStore((s) => s.goToSetup);
  const goToJournal = useGameStore((s) => s.goToJournal);
  const [showAi, setShowAi] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const compute = useCallback((now: number) => worldPopulationNow(now), []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <p className="mb-3 text-sm text-muted">{translate(locale, 'start.liveCounter.prefix')}</p>
      <NumberTicker compute={compute} className="text-4xl text-text sm:text-6xl" ariaLabel="население Земли" />
      <p className="mt-3 max-w-sm text-sm text-muted">{translate(locale, 'start.liveCounter.suffix')}</p>

      <Button variant="primary" className="mt-10 px-8 py-3 text-base" onClick={goToSetup}>
        {translate(locale, 'start.cta')}
      </Button>

      <div className="mt-8 flex gap-6 text-sm">
        <button className="text-muted underline-offset-4 hover:text-text hover:underline" onClick={goToJournal}>
          {translate(locale, 'start.link.journal')}
        </button>
        <button className="text-muted underline-offset-4 hover:text-text hover:underline" onClick={() => setShowAi(true)}>
          {translate(locale, 'start.link.aiSettings')}
        </button>
        <button className="text-muted underline-offset-4 hover:text-text hover:underline" onClick={() => setShowAbout(true)}>
          {translate(locale, 'start.link.about')}
        </button>
      </div>

      {showAi ? <AiSettingsOverlay onClose={() => setShowAi(false)} /> : null}
      {showAbout ? <AboutDataModal onClose={() => setShowAbout(false)} /> : null}
    </div>
  );
}

// Оверлей поверх стартового экрана — тот же AiSetupScreen, что и в потоке
// настройки сессии, просто вызванный прямо с главного меню (раздел 4: экран
// настройки ИИ "доступен и отсюда, и из шестерёнки в любом месте игры").
function AiSettingsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <AiSetupScreen onDone={onClose} onSkip={onClose} />
    </div>
  );
}
