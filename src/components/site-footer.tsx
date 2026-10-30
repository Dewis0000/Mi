import Link from "next/link";
import { Logo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-background/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="max-w-xs text-xs">
            Своя игра для тех, кто любит выпендриваться перед друзьями. Без занудства.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link className="hover:text-foreground" href="/play/demo">
            Играть
          </Link>
          <Link className="hover:text-foreground" href="/create">
            Создать игру
          </Link>
          <Link className="hover:text-foreground" href="/hall-of-shame">
            Зал Позора
          </Link>
          <Link className="hover:text-foreground" href="/dashboard">
            Мои игры
          </Link>
        </nav>
        <p className="text-xs">© 2026 Выпендрёж</p>
      </div>
    </footer>
  );
}
