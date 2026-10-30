"use client";

import { cn } from "@/lib/utils";

export function BuzzerButton({
  onBuzz,
  disabled,
  label = "ЖМИ!",
  size = "lg",
  className,
}: {
  onBuzz?: () => void;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onBuzz}
      className={cn(
        "group relative shrink-0 rounded-full outline-none disabled:cursor-not-allowed disabled:opacity-60",
        size === "lg" ? "size-36" : "size-20",
        className
      )}
    >
      {!disabled && (
        <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40 [animation-duration:2s]" />
      )}
      <span className="absolute inset-0 rounded-full bg-destructive/25 blur-xl" />
      <span
        className={cn(
          "relative flex h-full w-full items-center justify-center rounded-full border-4 border-destructive/30 bg-gradient-to-b from-destructive to-[color-mix(in_oklch,var(--destructive),black_25%)] font-display font-extrabold text-destructive-foreground shadow-[0_10px_0_0_color-mix(in_oklch,var(--destructive),black_35%),0_18px_25px_-6px_rgba(0,0,0,0.5)] transition-all group-active:translate-y-2 group-active:shadow-[0_2px_0_0_color-mix(in_oklch,var(--destructive),black_35%)]",
          size === "lg" ? "text-xl" : "text-xs"
        )}
      >
        {label}
      </span>
    </button>
  );
}
