import { useEffect, useState } from 'react';
import { useGameStore } from '../../store';
import { translate } from '../../i18n';
import { Modal } from '../primitives/Modal';

const TIMEOUT_SECONDS = 30;
const RISK_KEY: Record<string, string> = {
  надёжно: 'choice.risk.safe',
  рискованно: 'choice.risk.risky',
  неизвестно: 'choice.risk.unknown',
};

export function ChoiceModal() {
  const locale = useGameStore((s) => s.locale);
  const pendingChoice = useGameStore((s) => s.pendingChoice);
  const resolvedChoiceLabels = useGameStore((s) => s.resolvedChoiceLabels);
  const resolveChoice = useGameStore((s) => s.resolveChoice);
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SECONDS);

  useEffect(() => {
    if (!pendingChoice) return;
    setSecondsLeft(TIMEOUT_SECONDS);
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          resolveChoice(null, 'timeout');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChoice?.openedAt]);

  useEffect(() => {
    if (!pendingChoice) return;
    function onKeyDown(e: KeyboardEvent): void {
      const n = Number(e.key);
      if (n >= 1 && n <= pendingChoice!.choices.length) {
        resolveChoice(pendingChoice!.choices[n - 1].id, 'player');
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pendingChoice, resolveChoice]);

  if (!pendingChoice) return null;

  return (
    <Modal title={translate(locale, 'choice.title')}>
      <p className="mb-1 text-base font-medium text-text">{pendingChoice.title}</p>
      <p className="mb-5 text-sm leading-relaxed text-muted">{pendingChoice.body}</p>
      {pendingChoice.source === 'offline' ? (
        <span className="mb-3 inline-block rounded border border-border px-2 py-0.5 text-[10px] text-muted">
          {translate(locale, 'life.offlineTag')}
        </span>
      ) : null}

      <div className="space-y-2">
        {pendingChoice.choices.map((choice, i) => (
          <button
            key={choice.id}
            onClick={() => resolveChoice(choice.id, 'player')}
            className="flex w-full items-start justify-between gap-3 rounded border border-border px-4 py-3 text-left transition-colors hover:border-accent/60 focus-visible:outline-accent"
          >
            <span className="text-sm">
              <span className="mr-2 font-mono text-xs text-muted">{i + 1}</span>
              {resolvedChoiceLabels?.[choice.id] ?? choice.id}
            </span>
            <span className="shrink-0 text-xs text-muted">{translate(locale, RISK_KEY[choice.riskLabel] ?? 'choice.risk.unknown')}</span>
          </button>
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-muted" aria-live="polite">
        {translate(locale, 'choice.timeout', { seconds: secondsLeft })}
      </p>
    </Modal>
  );
}
