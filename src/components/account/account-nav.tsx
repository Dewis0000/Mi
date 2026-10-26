"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Ticket,
  Coins,
  Radio,
  Video,
  Gift,
  Receipt,
  Bell,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/account", label: "Обзор", icon: LayoutDashboard },
  { href: "/account/bookings", label: "Мои бронирования", icon: Ticket },
  { href: "/account/points", label: "Баллы и история", icon: Coins },
  { href: "/account/live", label: "Прямой эфир", icon: Radio },
  { href: "/account/videos", label: "Мои видео", icon: Video },
  { href: "/account/certificates", label: "Сертификаты", icon: Gift },
  { href: "/account/payments", label: "Платежи и чеки", icon: Receipt },
  { href: "/account/notifications", label: "Уведомления", icon: Bell },
  { href: "/account/profile", label: "Профиль", icon: UserCog },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent hover:text-accent-foreground",
              active && "bg-accent text-accent-foreground"
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
