"use client";

import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DemoPlayer } from "@/lib/demo-data";

export function ScorePanel({
  players,
  className,
}: {
  players: DemoPlayer[];
  className?: string;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;

  return (
    <div className={cn("grid gap-2 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {sorted.map((player) => {
        const isLeader = player.score === topScore && player.score > 0;
        return (
          <div
            key={player.id}
            className={cn(
              "flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 ring-1 ring-foreground/10 transition-shadow",
              isLeader && "glow-gold ring-gold/40"
            )}
          >
            <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
              {player.avatar}
              {isLeader && (
                <Crown className="absolute -top-2.5 -right-1.5 size-4 rotate-12 fill-gold text-gold" />
              )}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{player.name}</span>
              <span className="font-mono text-lg font-bold tabular-nums text-primary">
                {player.score}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
