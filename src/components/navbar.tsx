"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Trophy } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/play/demo", label: "Играть" },
  { href: "/create", label: "Создать" },
  { href: "/hall-of-shame", label: "Зал Позора" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Button
              key={link.href}
              variant="ghost"
              className={cn(
                pathname === link.href && "bg-muted text-foreground"
              )}
              nativeButton={false}
              render={<Link href={link.href} />}
            >
              {link.href === "/hall-of-shame" && <Trophy className="size-4" />}
              {link.label}
            </Button>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Войти
          </Button>
          <Button
            className="glow-primary"
            nativeButton={false}
            render={<Link href="/register" />}
          >
            Регистрация
          </Button>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="outline" size="icon" aria-label="Открыть меню" />
              }
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-xs">
              <SheetHeader className="border-b">
                <SheetTitle>
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4">
                {LINKS.map((link) => (
                  <SheetClose
                    key={link.href}
                    render={
                      <Link
                        href={link.href}
                        className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted"
                      />
                    }
                  >
                    {link.label}
                  </SheetClose>
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-2 border-t p-4">
                <SheetClose
                  render={
                    <Link
                      href="/login"
                      className={buttonVariants({ variant: "outline" })}
                    />
                  }
                >
                  Войти
                </SheetClose>
                <SheetClose
                  render={<Link href="/register" className={buttonVariants({})} />}
                >
                  Регистрация
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
