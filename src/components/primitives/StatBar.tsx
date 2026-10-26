interface StatBarProps {
  label: string;
  value: number;
  hint?: string;
  delta?: number;
}

export function StatBar({ label, value, hint, delta }: StatBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const deltaColor = delta && delta > 0 ? 'text-up' : delta && delta < 0 ? 'text-down' : 'text-muted';
  return (
    <div className="mb-3" title={hint}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span className="font-mono text-sm text-text" aria-hidden="true">
          {Math.round(clamped)}
          {delta ? <span className={`ml-1 text-xs ${deltaColor}`}>{delta > 0 ? `+${delta}` : delta}</span> : null}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-live="polite"
        aria-label={`${label} ${Math.round(clamped)} из 100`}
      >
        <div className="h-full rounded bg-accent transition-[width]" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
