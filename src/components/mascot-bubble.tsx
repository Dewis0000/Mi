"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { mascotLines } from "@/lib/demo-data";

export function MascotBubble({
  text,
  lines = mascotLines,
  rotate = true,
  intervalMs = 4500,
  className,
  name = "Павел Павлинович",
}: {
  text?: string;
  lines?: string[];
  rotate?: boolean;
  intervalMs?: number;
  className?: string;
  name?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!rotate || text || lines.length <= 1) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % lines.length),
      intervalMs
    );
    return () => clearInterval(id);
  }, [rotate, text, lines.length, intervalMs]);

  const shown = text ?? lines[index];

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <div className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary via-secondary to-gold text-xl glow-primary">
        🦚
      </div>
      <div className="relative max-w-sm rounded-2xl rounded-tl-sm bg-card px-4 py-3 text-sm ring-1 ring-foreground/10">
        <span className="mb-1 block font-display text-xs font-bold text-primary">
          {name}
        </span>
        <p key={shown} className="animate-in fade-in text-card-foreground">
          {shown}
        </p>
      </div>
    </div>
  );
}
