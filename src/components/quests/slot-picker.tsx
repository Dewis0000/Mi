"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";
import { formatPrice } from "@/lib/room-labels";
import { createBookingAction } from "@/app/(site)/quests/[slug]/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface SlotOption {
  id: string;
  startsAt: string;
  endsAt: string;
}

export function SlotPicker({
  slots,
  minPlayers,
  maxPlayers,
  basePrice,
  extraPlayerPrice,
}: {
  slots: SlotOption[];
  minPlayers: number;
  maxPlayers: number;
  basePrice: number;
  extraPlayerPrice: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [players, setPlayers] = useState(minPlayers);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, SlotOption[]>();
    for (const slot of slots) {
      const dateKey = new Date(slot.startsAt).toLocaleDateString("ru-RU", {
        weekday: "short",
        day: "2-digit",
        month: "short",
      });
      const arr = map.get(dateKey) ?? [];
      arr.push(slot);
      map.set(dateKey, arr);
    }
    return Array.from(map.entries());
  }, [slots]);

  const [activeDateIndex, setActiveDateIndex] = useState(0);

  const price = basePrice + Math.max(0, players - minPlayers) * extraPlayerPrice;

  function handleBook() {
    if (!selectedSlotId) {
      toast.error("Выберите время сессии");
      return;
    }
    startTransition(async () => {
      const result = await createBookingAction({ slotId: selectedSlotId, playersCount: players });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      if (result?.orderId) {
        router.push(`/checkout/${result.orderId}`);
      }
    });
  }

  if (slots.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Свободных слотов на ближайшие дни нет — загляните чуть позже или напишите нам в контактах.
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {byDate.map(([dateLabel], index) => (
          <Button
            key={dateLabel}
            type="button"
            size="sm"
            variant={index === activeDateIndex ? "default" : "outline"}
            onClick={() => {
              setActiveDateIndex(index);
              setSelectedSlotId(null);
            }}
            className="shrink-0 capitalize"
          >
            {dateLabel}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {byDate[activeDateIndex]?.[1].map((slot) => {
          const time = new Date(slot.startsAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
          return (
            <Button
              key={slot.id}
              type="button"
              size="sm"
              variant={selectedSlotId === slot.id ? "default" : "outline"}
              onClick={() => setSelectedSlotId(slot.id)}
            >
              {time}
            </Button>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        <div>
          <p className="text-sm text-muted-foreground">Игроков</p>
          <div className="mt-1 flex items-center gap-3">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              disabled={players <= minPlayers}
              onClick={() => setPlayers((p) => Math.max(minPlayers, p - 1))}
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="w-6 text-center font-medium">{players}</span>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              disabled={players >= maxPlayers}
              onClick={() => setPlayers((p) => Math.min(maxPlayers, p + 1))}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Стоимость</p>
          <p className="text-xl font-semibold">{formatPrice(price)}</p>
        </div>
      </div>

      <Button className="w-full" size="lg" disabled={isPending} onClick={handleBook}>
        {isPending ? "Бронируем…" : "Забронировать"}
      </Button>
    </div>
  );
}
