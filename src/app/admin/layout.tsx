import Link from "next/link";
import { Compass } from "lucide-react";
import { requireStaff } from "@/lib/current-user";
import { AdminNav } from "@/components/admin/admin-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { siteConfig } from "@/lib/site-config";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireStaff();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <Link href="/admin" className="flex items-center gap-2 font-heading text-lg font-bold">
          <Compass className="size-6 text-primary" />
          {siteConfig.name} · Админ
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {user.name} · {user.role}
          </span>
          <ThemeToggle />
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            На сайт
          </Link>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <div className="lg:w-56 lg:shrink-0">
          <AdminNav role={user.role} />
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
