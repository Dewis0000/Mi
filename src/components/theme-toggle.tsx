"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMounted } from "@/hooks/use-mounted";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label="Переключить тему"
            className="rounded-full border-border/70 bg-card/60"
          />
        }
      >
        {mounted && theme === "light" ? (
          <Sun className="size-4" />
        ) : mounted && theme === "system" ? (
          <Monitor className="size-4" />
        ) : (
          <Moon className="size-4" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="font-sans">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="size-4" /> Светлая
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="size-4" /> Тёмная
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="size-4" /> Системная
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
