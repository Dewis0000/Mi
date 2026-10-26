import Link from "next/link";
import { LayoutDashboard, LogOut, Shield, Ticket } from "lucide-react";
import { auth } from "@/lib/auth";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export async function AuthArea() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" render={<Link href="/login" />}>
          Войти
        </Button>
        <Button render={<Link href="/register" />}>Регистрация</Button>
      </div>
    );
  }

  const initials = session.user.name
    ?.split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const canManage = session.user.role === "ADMIN" || session.user.role === "MANAGER" || session.user.role === "ACTOR";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2 px-2" />}>
        <Avatar className="size-7">
          <AvatarFallback>{initials || "И"}</AvatarFallback>
        </Avatar>
        <span className="max-w-24 truncate text-sm font-medium">{session.user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{session.user.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/account" />}>
          <LayoutDashboard className="size-4" /> Личный кабинет
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account/bookings" />}>
          <Ticket className="size-4" /> Мои бронирования
        </DropdownMenuItem>
        {canManage && (
          <DropdownMenuItem render={<Link href="/admin" />}>
            <Shield className="size-4" /> Админ-панель
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem render={<button type="submit" className="w-full" />}>
            <LogOut className="size-4" /> Выйти
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
