"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarCheck,
  DoorOpen,
  MapPin,
  Video,
  Film,
  Users,
  Trophy,
  CreditCard,
  Tag,
  Star,
  Newspaper,
  UserCog,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Дашборд", icon: LayoutDashboard, roles: ["ADMIN", "MANAGER"] },
  { href: "/admin/console", label: "Стойка регистрации", icon: DoorOpen, roles: ["ADMIN", "MANAGER", "ACTOR"] },
  { href: "/admin/bookings", label: "Бронирования", icon: CalendarCheck, roles: ["ADMIN", "MANAGER"] },
  { href: "/admin/rooms", label: "Квесты", icon: DoorOpen, roles: ["ADMIN", "MANAGER"] },
  { href: "/admin/locations", label: "Локации", icon: MapPin, roles: ["ADMIN", "MANAGER"] },
  { href: "/admin/cameras", label: "Камеры", icon: Video, roles: ["ADMIN", "MANAGER"] },
  { href: "/admin/videos", label: "Видео и продажи", icon: Film, roles: ["ADMIN", "MANAGER"] },
  { href: "/admin/users", label: "Пользователи", icon: Users, roles: ["ADMIN", "MANAGER"] },
  { href: "/admin/loyalty", label: "Лояльность", icon: Trophy, roles: ["ADMIN"] },
  { href: "/admin/payments", label: "Платежи и чеки", icon: CreditCard, roles: ["ADMIN"] },
  { href: "/admin/promocodes", label: "Промокоды", icon: Tag, roles: ["ADMIN", "MANAGER"] },
  { href: "/admin/reviews", label: "Отзывы", icon: Star, roles: ["ADMIN", "MANAGER"] },
  { href: "/admin/blog", label: "Блог", icon: Newspaper, roles: ["ADMIN", "MANAGER"] },
  { href: "/admin/staff", label: "Сотрудники", icon: UserCog, roles: ["ADMIN"] },
  { href: "/admin/audit", label: "Журнал действий", icon: History, roles: ["ADMIN"] },
];

export function AdminNav({ role }: { role: string }) {
  const pathname = usePathname();
  const visible = items.filter((item) => item.roles.includes(role));

  return (
    <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
      {visible.map((item) => {
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
