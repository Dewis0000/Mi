"use client";

import { cn } from "@/lib/utils";
import { avatarOptions } from "@/lib/demo-data";

export function AvatarPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (avatar: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-6 gap-2", className)}>
      {avatarOptions.map((avatar) => {
        const selected = avatar === value;
        return (
          <button
            key={avatar}
            type="button"
            aria-label={`Выбрать аватар ${avatar}`}
            aria-pressed={selected}
            onClick={() => onChange(avatar)}
            className={cn(
              "flex aspect-square items-center justify-center rounded-xl text-xl ring-1 ring-foreground/10 transition-all hover:-translate-y-0.5 hover:ring-primary/50",
              selected
                ? "glow-primary scale-105 bg-primary/15 ring-2 ring-primary"
                : "bg-card"
            )}
          >
            {avatar}
          </button>
        );
      })}
    </div>
  );
}
