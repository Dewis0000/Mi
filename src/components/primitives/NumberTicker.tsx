import { useEffect, useState } from 'react';

function usesReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface NumberTickerProps {
  compute: (now: number) => number;
  format?: (n: number) => string;
  className?: string;
  ariaLabel?: string;
}

/** Тикающий счётчик (население Земли и т.п.) — единственная "живая" анимация помимо появления карточек. */
export function NumberTicker({ compute, format, className = '', ariaLabel }: NumberTickerProps) {
  const [value, setValue] = useState(() => compute(Date.now()));

  useEffect(() => {
    const intervalMs = usesReducedMotion() ? 5000 : 400;
    const id = setInterval(() => setValue(compute(Date.now())), intervalMs);
    return () => clearInterval(id);
  }, [compute]);

  const text = format ? format(value) : value.toLocaleString('ru-RU');
  return (
    <span className={`font-mono tabular-nums ${className}`} aria-live="off" aria-label={ariaLabel}>
      {text}
    </span>
  );
}
