"use client";

import { useEffect, useState } from "react";
import { Eye, SkipForward } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BuzzerButton } from "@/components/game/buzzer-button";
import { MascotBubble } from "@/components/mascot-bubble";
import { useConfetti } from "@/components/confetti-burst";
import { mascotLines } from "@/lib/demo-data";
import type { DemoPlayer, DemoQuestion } from "@/lib/demo-data";

const TOTAL_SECONDS = 20;

type Phase = "question" | "buzzed" | "revealed";

export function QuestionModal({
  open,
  onOpenChange,
  categoryTitle,
  question,
  players,
  onAward,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryTitle: string;
  question: DemoQuestion | null;
  players: DemoPlayer[];
  onAward: (playerId: string | null, correct: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>("question");
  const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS);
  const [buzzedPlayer, setBuzzedPlayer] = useState<DemoPlayer | null>(null);
  const [reaction, setReaction] = useState<string | null>(null);
  const fireConfetti = useConfetti();

  // Таймер истёк сам — это производное состояние, а не отдельный эффект.
  const effectivePhase: Phase =
    phase === "question" && timeLeft <= 0 ? "revealed" : phase;

  useEffect(() => {
    if (!open || phase !== "question" || timeLeft <= 0) return;
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [open, phase, timeLeft]);

  function handleBuzz(player: DemoPlayer) {
    setBuzzedPlayer(player);
    setPhase("buzzed");
  }

  function handleJudge(correct: boolean) {
    if (correct) fireConfetti();
    setReaction(mascotLines[Math.floor(Math.random() * mascotLines.length)]);
    setPhase("revealed");
    onAward(buzzedPlayer?.id ?? null, correct);
  }

  if (!question) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-5 p-6 sm:rounded-3xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <Badge className="bg-secondary text-secondary-foreground">
              {categoryTitle}
            </Badge>
            <span className="font-mono text-2xl font-extrabold text-gold">
              {question.value}
            </span>
          </div>
          <DialogTitle className="sr-only">Вопрос за {question.value}</DialogTitle>
        </DialogHeader>

        {effectivePhase === "question" && (
          <Progress value={(timeLeft / TOTAL_SECONDS) * 100} />
        )}

        <p className="font-display text-xl leading-snug font-bold sm:text-2xl">
          {question.question}
        </p>

        {effectivePhase === "question" && (
          <div className="flex flex-col items-center gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              Кто жмёт на кнопку первым?
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {players.map((player) => (
                <button
                  key={player.id}
                  onClick={() => handleBuzz(player)}
                  className="flex flex-col items-center gap-1 text-xs text-muted-foreground transition-transform hover:-translate-y-0.5 hover:text-foreground"
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-muted text-lg ring-1 ring-foreground/10">
                    {player.avatar}
                  </span>
                  {player.name.split(" ")[0]}
                </button>
              ))}
            </div>
            <BuzzerButton size="sm" onBuzz={() => handleBuzz(players[0])} />
          </div>
        )}

        {effectivePhase === "buzzed" && buzzedPlayer && (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted/60 py-5 text-center">
            <span className="text-3xl">{buzzedPlayer.avatar}</span>
            <p className="text-sm">
              <span className="font-semibold">{buzzedPlayer.name}</span>{" "}
              жмёт на кнопку. Ну, выпендривайся — говори ответ вслух.
            </p>
            <Button variant="secondary" onClick={() => setPhase("revealed")}>
              <Eye className="size-4" /> Показать правильный ответ
            </Button>
          </div>
        )}

        {effectivePhase === "revealed" && (
          <div className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-4">
            <p className="text-sm text-muted-foreground">Правильный ответ:</p>
            <p className="font-display text-lg font-bold text-success">
              {question.answer}
            </p>
            {reaction && <MascotBubble text={reaction} rotate={false} />}
            {buzzedPlayer && !reaction && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  className="bg-success/15 text-success hover:bg-success/25"
                  variant="ghost"
                  onClick={() => handleJudge(true)}
                >
                  ✅ {buzzedPlayer.name.split(" ")[0]} ответил верно
                </Button>
                <Button variant="destructive" onClick={() => handleJudge(false)}>
                  ❌ Это было неверно
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              onAward(null, false);
              onOpenChange(false);
            }}
          >
            <SkipForward className="size-4" /> Никто не знает, дальше
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
