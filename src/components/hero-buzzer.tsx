"use client";

import { useState } from "react";
import { BuzzerButton } from "@/components/game/buzzer-button";
import { useConfetti } from "@/components/confetti-burst";

const REACTIONS = [
  "Ого. Решительно. Пока без пользы, но решительно.",
  "Выпендрёж засчитан. Баллов пока не положено.",
  "Ты точно знаешь, что тут нет вопроса?",
  "Кнопка оценила твой энтузиазм.",
  "Ещё раз — и мы начислим тебе уважение. Не баллы, но уважение.",
];

export function HeroBuzzer() {
  const [clicks, setClicks] = useState(0);
  const [reaction, setReaction] = useState<string | null>(null);
  const fireConfetti = useConfetti();

  function handleBuzz() {
    setClicks((c) => c + 1);
    setReaction(REACTIONS[Math.floor(Math.random() * REACTIONS.length)]);
    if ((clicks + 1) % 5 === 0) fireConfetti(0.3);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <BuzzerButton onBuzz={handleBuzz} label="ЖМИ" />
      <p className="h-5 text-xs text-muted-foreground">
        {reaction ?? "Эта кнопка ничего не решает. Но жми, раз руки чешутся."}
      </p>
      {clicks > 0 && (
        <p className="font-mono text-xs text-muted-foreground/70">
          Нажатий без смысла: {clicks}
        </p>
      )}
    </div>
  );
}
