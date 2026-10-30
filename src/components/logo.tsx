import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "group flex items-center gap-2.5 font-display font-bold tracking-tight",
        className
      )}
    >
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary via-secondary to-gold text-lg shadow-inner transition-transform group-hover:-rotate-6 group-hover:scale-105">
        <span aria-hidden className="drop-shadow-sm">
          🦚
        </span>
      </span>
      <span className="text-lg leading-none">
        Вы<span className="text-primary">пендрёж</span>
      </span>
    </Link>
  );
}
