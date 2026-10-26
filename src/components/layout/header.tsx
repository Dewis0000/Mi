import Link from "next/link";
import { Compass } from "lucide-react";
import { mainNav, siteConfig } from "@/lib/site-config";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AuthArea } from "@/components/layout/auth-area";
import { LiveNowBadge } from "@/components/live/live-now-badge";

export function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-heading text-lg font-bold">
          <Compass className="size-6 text-primary" />
          {siteConfig.name}
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
            >
              {item.title}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <LiveNowBadge />
          </div>
          <ThemeToggle />
          <div className="hidden lg:block">
            <AuthArea />
          </div>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
