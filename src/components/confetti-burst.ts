"use client";

import confetti from "canvas-confetti";
import { useCallback } from "react";

const BRAND_COLORS = ["#2dd4bf", "#6d8dff", "#ffcf5c", "#c084fc"];

export function useConfetti() {
  return useCallback((originY = 0.6) => {
    confetti({
      particleCount: 90,
      spread: 75,
      startVelocity: 38,
      origin: { y: originY },
      colors: BRAND_COLORS,
      scalar: 0.9,
      ticks: 180,
    });
  }, []);
}
