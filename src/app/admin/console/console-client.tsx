"use client";

import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  searchBookingsAction,
  checkInAction,
  startGameAction,
  completeBookingAction,
  noShowAction,
} from "./actions";

type BookingRow = Awaited<ReturnType<typeof searchBookingsAction>>[number];

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Ожидает оплаты",
  CONFIRMED: "Подтверждено",
  CHECKED_IN: "Отметились",
  IN_PROGRESS: "Идёт игра",
  COMPLETED: "Завершено",
  NO_SHOW: "Не пришли",
  CANCELLED: "Отменено",
  REFUNDED: "Возврат",
};

export function ConsoleClient({ initial }: { initial: BookingRow[] }) {
  const [query, setQuery] = useState("");
  const [bookings, setBookings] = useState(initial);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timeout = setTimeout(() => {
      startTransition(async () => {
        const results = await searchBookingsAction(query);
        setBookings(results);
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  function refresh() {
    startTransition(async () => {
      const results = await searchBookingsAction(query);
      setBookings(results);
    });
  }

  function runAction(action: (id: string) => Promise<void>, id: string, successMsg: string) {
    startTransition(async () => {
      try {
        await action(id);
        toast.success(successMsg);
        refresh();
      } catch {
        toast.error("Не удалось выполнить действие");
      }
    });
  }

  return (
    <div>
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Код брони, телефон или имя…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="mt-4 space-y-3">
        {bookings.map((booking) => (
          <div key={booking.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {booking.slot.startsAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                  {booking.slot.room.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {booking.user?.name ?? booking.guestName ?? "Гость"} ·{" "}
                  {booking.user?.phone ?? booking.guestPhone ?? "—"} · {booking.playersCount} игроков · код{" "}
                  <span className="font-mono">{booking.code}</span>
                </p>
              </div>
              <Badge variant="outline">{STATUS_LABELS[booking.status] ?? booking.status}</Badge>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {booking.status === "CONFIRMED" && (
                <Button size="sm" disabled={isPending} onClick={() => runAction(checkInAction, booking.id, "Отметили приход")}>
                  Пришли
                </Button>
              )}
              {(booking.status === "CHECKED_IN" || booking.status === "CONFIRMED") && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => runAction(startGameAction, booking.id, "Игра начата")}
                >
                  Начать игру
                </Button>
              )}
              {(booking.status === "IN_PROGRESS" || booking.status === "CHECKED_IN") && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => runAction(completeBookingAction, booking.id, "Визит завершён, баллы начислены")}
                >
                  Завершить
                </Button>
              )}
              {booking.status === "CONFIRMED" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => runAction(noShowAction, booking.id, "Отмечено как неявка")}
                >
                  Не пришли
                </Button>
              )}
              {booking.liveSession?.status === "LIVE" && (
                <Badge className="border-live/30 text-live" variant="outline">
                  В эфире
                </Badge>
              )}
            </div>
          </div>
        ))}
        {bookings.length === 0 && <p className="mt-6 text-center text-muted-foreground">Ничего не найдено.</p>}
      </div>
    </div>
  );
}
