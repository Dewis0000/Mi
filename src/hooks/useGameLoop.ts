import { useEffect } from 'react';
import { useGameStore } from '../store';

/** Главный игровой цикл — один раз на всё приложение. */
export function useGameLoop(): void {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    function frame(now: number): void {
      const delta = Math.min(now - last, 250); // защита от огромного прыжка после сворачивания вкладки
      last = now;
      useGameStore.getState().tickClock(delta);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
}
