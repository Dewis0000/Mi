"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createManualBookingAction } from "../actions";
import { getOpenSlotsAction } from "./actions";

export function ManualBookingForm({ rooms }: { rooms: { id: string; title: string }[] }) {
  const [state, formAction, pending] = useActionState<{ error?: string; success?: string } | undefined, FormData>(
    createManualBookingAction,
    undefined
  );
  const [roomId, setRoomId] = useState("");
  const [slots, setSlots] = useState<{ id: string; startsAt: string }[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      if (!roomId) {
        setSlots([]);
        return;
      }
      setSlots(await getOpenSlotsAction(roomId));
    });
  }, [roomId]);

  return (
    <form action={formAction} className="max-w-md space-y-4 rounded-xl border p-5">
      <div className="space-y-1.5">
        <Label>Квест</Label>
        <Select value={roomId} onValueChange={(value) => setRoomId(value ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Выберите квест" />
          </SelectTrigger>
          <SelectContent>
            {rooms.map((room) => (
              <SelectItem key={room.id} value={room.id}>
                {room.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Время</Label>
        <Select name="slotId" disabled={!roomId || isPending}>
          <SelectTrigger>
            <SelectValue placeholder={isPending ? "Загрузка…" : "Выберите слот"} />
          </SelectTrigger>
          <SelectContent>
            {slots.map((slot) => (
              <SelectItem key={slot.id} value={slot.id}>
                {new Date(slot.startsAt).toLocaleString("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="playersCount">Игроков</Label>
        <Input id="playersCount" name="playersCount" type="number" min={1} defaultValue={2} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="guestName">Имя клиента</Label>
        <Input id="guestName" name="guestName" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="guestPhone">Телефон</Label>
        <Input id="guestPhone" name="guestPhone" type="tel" placeholder="+7 900 000-00-00" required />
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-success">{state.success}</p>}

      <Button type="submit" disabled={pending}>
        Создать бронирование
      </Button>
    </form>
  );
}
