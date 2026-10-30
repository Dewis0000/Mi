"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameBoard } from "@/components/game/board";
import { QuestionModal } from "@/components/game/question-modal";
import { ScorePanel } from "@/components/game/score-panel";
import { MascotBubble } from "@/components/mascot-bubble";
import { useConfetti } from "@/components/confetti-burst";
import { demoPack, demoPlayers, type DemoPlayer } from "@/lib/demo-data";

function freshPlayers(): DemoPlayer[] {
  return demoPlayers.map((p) => ({ ...p, score: 0 }));
}

export function DemoPlayClient() {
  const [players, setPlayers] = useState<DemoPlayer[]>(freshPlayers);
  const [usedKeys, setUsedKeys] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<{ ci: number; qi: number } | null>(
    null
  );
  const [open, setOpen] = useState(false);
  const fireConfetti = useConfetti();

  const totalQuestions = useMemo(
    () =>
      demoPack.categories.reduce((sum, c) => sum + c.questions.length, 0),
    []
  );
  const gameOver = usedKeys.size >= totalQuestions;
  const winner = useMemo(
    () => [...players].sort((a, b) => b.score - a.score)[0],
    [players]
  );

  useEffect(() => {
    if (gameOver) fireConfetti(0.4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver]);

  function handleSelect(ci: number, qi: number) {
    setSelected({ ci, qi });
    setOpen(true);
  }

  function handleAward(playerId: string | null, correct: boolean) {
    if (!selected) return;
    const key = `${selected.ci}-${selected.qi}`;
    const value = demoPack.categories[selected.ci].questions[selected.qi].value;

    setUsedKeys((prev) => new Set(prev).add(key));

    if (playerId) {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId
            ? { ...p, score: p.score + (correct ? value : -value) }
            : p
        )
      );
    }
  }

  function handleReset() {
    setPlayers(freshPlayers());
    setUsedKeys(new Set());
    setSelected(null);
    setOpen(false);
  }

  const activeQuestion = selected
    ? demoPack.categories[selected.ci].questions[selected.qi]
    : null;
  const activeCategory = selected
    ? demoPack.categories[selected.ci].title
    : "";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            {demoPack.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Выбирайте вопрос, жмите на кнопку, судите честно. Или нет.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleReset}>
          <RotateCcw className="size-4" /> Новая игра
        </Button>
      </div>

      <ScorePanel players={players} />

      {gameOver ? (
        <div className="animate-in fade-in flex flex-col items-center gap-4 rounded-3xl bg-gradient-to-br from-primary/15 via-card to-gold/15 p-8 text-center ring-1 ring-foreground/10">

          <span className="text-4xl">{winner?.avatar}</span>
          <h2 className="font-display text-2xl font-bold">
            Победитель — {winner?.name}!
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {winner && winner.score > 0
              ? "Выпендрёж оправдан: баллы на руках, уважение в кармане."
              : "Все в минусе — зато никто не соврал с уверенным видом. Почти."}
          </p>
          <Button onClick={handleReset}>Сыграть ещё раз</Button>
        </div>
      ) : (
        <GameBoard
          categories={demoPack.categories}
          usedKeys={usedKeys}
          onSelect={handleSelect}
        />
      )}

      <MascotBubble className="mt-2" />

      <QuestionModal
        key={selected ? `${selected.ci}-${selected.qi}` : "idle"}
        open={open}
        onOpenChange={setOpen}
        categoryTitle={activeCategory}
        question={activeQuestion}
        players={players}
        onAward={handleAward}
      />
    </div>
  );
}
