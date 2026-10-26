"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { mainNav, footerNav, siteConfig } from "@/lib/site-config";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Открыть меню" />}
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="right" className="w-[300px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-heading">{siteConfig.name}</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent",
                pathname === item.href && "bg-accent text-accent-foreground"
              )}
            >
              {item.title}
            </Link>
          ))}
          <div className="my-2 h-px bg-border" />
          {footerNav.company.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {item.title}
            </Link>
          ))}
          <div className="my-2 h-px bg-border" />
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            Войти
          </Link>
          <Link
            href="/register"
            onClick={() => setOpen(false)}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground text-center"
          >
            Регистрация
          </Link>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
