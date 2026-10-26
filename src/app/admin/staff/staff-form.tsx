"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { promoteStaffAction, type StaffActionState } from "./actions";

export function StaffForm({ locations }: { locations: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<StaffActionState, FormData>(promoteStaffAction, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border p-4">
      <div className="space-y-1.5">
        <Label>Телефон сотрудника</Label>
        <Input name="phone" type="tel" placeholder="+7 900 000-00-00" className="w-48" required />
      </div>
      <div className="space-y-1.5">
        <Label>Роль</Label>
        <Select name="role" defaultValue="ACTOR">
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTOR">Актёр/оператор</SelectItem>
            <SelectItem value="MANAGER">Менеджер</SelectItem>
            <SelectItem value="ADMIN">Админ</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Локация</Label>
        <Select name="locationId">
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Любая" />
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
      <Button type="submit" disabled={pending}>
        Назначить
      </Button>
      {state?.error && <p className="w-full text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="w-full text-sm text-success">{state.success}</p>}
    </form>
  );
}
