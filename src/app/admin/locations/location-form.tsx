"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createLocationAction, updateLocationAction, type LocationActionState } from "./actions";
import type { LocationModel } from "../../../../generated/models";

export function LocationForm({ location }: { location?: LocationModel }) {
  const action = location ? updateLocationAction : createLocationAction;
  const [state, formAction, pending] = useActionState<LocationActionState, FormData>(action, undefined);

  return (
    <form action={formAction} className="max-w-md space-y-4">
      {location && <input type="hidden" name="id" value={location.id} />}
      <div className="space-y-1.5">
        <Label htmlFor="name">Название</Label>
        <Input id="name" name="name" defaultValue={location?.name} placeholder="Лабиринт на Тверской" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="city">Город</Label>
        <Input id="city" name="city" defaultValue={location?.city} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="address">Адрес</Label>
        <Input id="address" name="address" defaultValue={location?.address} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Телефон локации (необязательно)</Label>
        <Input id="phone" name="phone" defaultValue={location?.phone ?? ""} placeholder="+7 900 000-00-00" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="lat">Широта (необязательно)</Label>
          <Input id="lat" name="lat" type="number" step="any" defaultValue={location?.lat ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lng">Долгота (необязательно)</Label>
          <Input id="lng" name="lng" type="number" step="any" defaultValue={location?.lng ?? ""} />
        </div>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-success">{state.success}</p>}
      <Button type="submit" disabled={pending}>
        {location ? "Сохранить" : "Создать локацию"}
      </Button>
    </form>
  );
}
