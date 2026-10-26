"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createRoomAction, updateRoomAction, type RoomActionState } from "./actions";
import { GENRE_LABELS, DIFFICULTY_LABELS } from "@/lib/room-labels";
import type { RoomModel } from "../../../../generated/models";

const STATUS_LABELS = { ACTIVE: "Активен", PAUSED: "На паузе", ARCHIVED: "Архив" };

export function RoomForm({
  room,
  locations,
}: {
  room?: RoomModel;
  locations: { id: string; name: string }[];
}) {
  const action = room ? updateRoomAction : createRoomAction;
  const [state, formAction, pending] = useActionState<RoomActionState, FormData>(action, undefined);

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      {room && <input type="hidden" name="id" value={room.id} />}

      <div className="space-y-1.5">
        <Label htmlFor="title">Название</Label>
        <Input id="title" name="title" defaultValue={room?.title} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Описание</Label>
        <Textarea id="description" name="description" rows={4} defaultValue={room?.description} required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Локация</Label>
          <Select name="locationId" defaultValue={room?.locationId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Выберите локацию" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Статус</Label>
          <Select name="status" defaultValue={room?.status ?? "ACTIVE"}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Жанр</Label>
          <Select name="genre" defaultValue={room?.genre}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Жанр" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(GENRE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Сложность</Label>
          <Select name="difficulty" defaultValue={room?.difficulty}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Сложность" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="minPlayers">Мин. игроков</Label>
          <Input id="minPlayers" name="minPlayers" type="number" min={1} defaultValue={room?.minPlayers ?? 2} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="maxPlayers">Макс. игроков</Label>
          <Input id="maxPlayers" name="maxPlayers" type="number" min={1} defaultValue={room?.maxPlayers ?? 6} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ageLimit">Возраст 18+/16+ и т.д.</Label>
          <Input id="ageLimit" name="ageLimit" type="number" min={0} defaultValue={room?.ageLimit ?? 12} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="durationMinutes">Длительность, мин</Label>
          <Input id="durationMinutes" name="durationMinutes" type="number" min={15} defaultValue={room?.durationMinutes ?? 60} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cleanupMinutes">Уборка, мин</Label>
          <Input id="cleanupMinutes" name="cleanupMinutes" type="number" min={0} defaultValue={room?.cleanupMinutes ?? 15} required />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="basePrice">Базовая цена, ₽</Label>
          <Input id="basePrice" name="basePrice" type="number" min={0} step={100} defaultValue={room?.basePrice ?? 3000} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="extraPlayerPrice">За доп. игрока, ₽</Label>
          <Input id="extraPlayerPrice" name="extraPlayerPrice" type="number" min={0} step={50} defaultValue={room?.extraPlayerPrice ?? 0} required />
        </div>
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-success">{state.success}</p>}

      <Button type="submit" disabled={pending}>
        {room ? "Сохранить" : "Создать квест"}
      </Button>
    </form>
  );
}
