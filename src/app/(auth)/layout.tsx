import Link from "next/link";
import { Compass } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-heading text-lg font-bold">
          <Compass className="size-6 text-primary" />
          {siteConfig.name}
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">{children}</main>
    </div>
  );
}
