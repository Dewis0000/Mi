import { useEffect } from 'react';
import { useGameStore } from './store';
import { useGameLoop } from './hooks/useGameLoop';
import { translate } from './i18n';
import { StartScreen } from './components/screens/StartScreen';
import { SetupScreen } from './components/screens/SetupScreen';
import { AiSetupScreen } from './components/screens/AiSetupScreen';
import { BirthScreen } from './components/screens/BirthScreen';
import { LifeScreen } from './components/screens/LifeScreen';
import { DeathScreen } from './components/screens/DeathScreen';
import { EpilogueScreen } from './components/screens/EpilogueScreen';
import { JournalScreen } from './components/screens/JournalScreen';
import { Modal } from './components/primitives/Modal';
import { Button } from './components/primitives/Button';

export default function App() {
  const phase = useGameStore((s) => s.phase);
  const locale = useGameStore((s) => s.locale);
  const setLocale = useGameStore((s) => s.setLocale);
  const goToMenu = useGameStore((s) => s.goToMenu);
  const goToAiSetup = useGameStore((s) => s.goToAiSetup);
  const startNewLife = useGameStore((s) => s.startNewLife);
  const updateSetupDraft = useGameStore((s) => s.updateSetupDraft);
  const checkAutosave = useGameStore((s) => s.checkAutosave);
  const resumePromptAvailable = useGameStore((s) => s.resumePromptAvailable);
  const resumeAutosave = useGameStore((s) => s.resumeAutosave);
  const discardAutosave = useGameStore((s) => s.discardAutosave);
  const awaitingText = useGameStore((s) => s.awaitingText);
  const ackWarning = useGameStore((s) => s.ackWarning);
  const acknowledgeWarning = useGameStore((s) => s.acknowledgeWarning);

  useGameLoop();

  useEffect(() => {
    // Сид в URL (раздел 15): ?seed=A7K2M9P4X1QW запускает игру сразу с этим
    // рождением — бесплатный шеринг конкретных судеб по ссылке.
    const params = new URLSearchParams(window.location.search);
    const seedFromUrl = params.get('seed');
    if (seedFromUrl && seedFromUrl.trim().length > 0) {
      window.history.replaceState(null, '', window.location.pathname);
      updateSetupDraft({ seed: seedFromUrl.trim(), birthMode: 'random', countryIso3: undefined, regionId: undefined });
      startNewLife();
    } else {
      checkAutosave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text">
      {phase !== 'alive' && phase !== 'choice' ? (
        <div className="flex justify-end px-4 pt-2">
          <button
            className="text-xs text-muted hover:text-text"
            onClick={() => setLocale(locale === 'ru' ? 'en' : 'ru')}
            aria-label={translate(locale, 'common.language')}
          >
            {locale === 'ru' ? 'EN' : 'RU'}
          </button>
        </div>
      ) : null}

      {awaitingText && phase === 'alive' ? (
        <div className="fixed right-3 top-3 z-30 rounded border border-border bg-card px-2 py-1 text-xs text-muted">…</div>
      ) : null}

      {phase === 'menu' ? <StartScreen /> : null}
      {phase === 'setup' ? <SetupScreen onNext={goToAiSetup} onBack={goToMenu} /> : null}
      {phase === 'ai-setup' ? <AiSetupScreen onDone={startNewLife} onSkip={startNewLife} /> : null}
      {phase === 'birth' ? <BirthScreen /> : null}
      {(phase === 'alive' || phase === 'choice') ? <LifeScreen /> : null}
      {phase === 'dead' ? <DeathScreen /> : null}
      {phase === 'epilogue' ? <EpilogueScreen /> : null}
      {phase === 'journal' ? <JournalScreen /> : null}

      {resumePromptAvailable && phase === 'menu' ? (
        <Modal title={translate(locale, 'life.resumePrompt.title')}>
          <p className="mb-6 text-sm text-muted">{translate(locale, 'life.resumePrompt.body')}</p>
          <div className="flex gap-3">
            <Button variant="primary" onClick={resumeAutosave}>
              {translate(locale, 'life.resumePrompt.continue')}
            </Button>
            <Button variant="secondary" onClick={discardAutosave}>
              {translate(locale, 'life.resumePrompt.discard')}
            </Button>
          </div>
        </Modal>
      ) : null}

      {!ackWarning ? (
        <Modal title={translate(locale, 'start.warning.title')}>
          <p className="mb-6 text-sm leading-relaxed text-muted">{translate(locale, 'start.warning.body')}</p>
          <Button variant="primary" onClick={acknowledgeWarning}>
            {translate(locale, 'start.warning.ack')}
          </Button>
        </Modal>
      ) : null}
    </div>
  );
}
