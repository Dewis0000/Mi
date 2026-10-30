"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type { DemoCategory } from "@/lib/demo-data";

export function GameBoard({
  categories,
  usedKeys,
  onSelect,
  className,
}: {
  categories: DemoCategory[];
  usedKeys: Set<string>;
  onSelect: (categoryIndex: number, questionIndex: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto pb-2", className)}>
      <div
        className="grid min-w-[760px] gap-1.5 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${categories.length}, minmax(0, 1fr))` }}
      >
        {categories.map((category) => (
          <div
            key={category.title}
            className="flex min-h-16 items-center justify-center rounded-xl bg-gradient-to-br from-secondary to-secondary/70 p-2 text-center font-display text-[11px] font-bold uppercase leading-tight tracking-wide text-secondary-foreground ring-1 ring-foreground/10 sm:text-sm"
          >
            {category.title}
          </div>
        ))}

        {categories[0]?.questions.map((_, qi) => (
          <Fragment key={qi}>
            {categories.map((category, ci) => {
              const key = `${ci}-${qi}`;
              const used = usedKeys.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={used}
                  onClick={() => onSelect(ci, qi)}
                  className={cn(
                    "flex aspect-[4/3] items-center justify-center rounded-xl font-mono text-lg font-extrabold tabular-nums ring-1 transition-all sm:text-2xl",
                    used
                      ? "cursor-default bg-muted text-muted-foreground/40 ring-foreground/5"
                      : "bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),var(--secondary)_35%)] text-primary-foreground ring-foreground/10 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
                  )}
                >
                  {used ? "✓" : category.questions[qi].value}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
