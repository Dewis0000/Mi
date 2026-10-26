"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateProfileAction, type ProfileActionState } from "./actions";

export function ProfileForm({ name, email, phone, phonePending }: { name: string; email: string | null; phone: string; phonePending: boolean }) {
  const [state, formAction, pending] = useActionState<ProfileActionState, FormData>(updateProfileAction, undefined);

  return (
    <form action={formAction} className="space-y-4 rounded-xl border p-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Имя</Label>
        <Input id="name" name="name" defaultValue={name} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={email ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Телефон</Label>
        {phonePending ? (
          <Input id="phone" name="phone" type="tel" placeholder="+7 900 000-00-00" />
        ) : (
          <Input value={phone} disabled />
        )}
        {phonePending && (
          <p className="text-xs text-muted-foreground">
            Вы вошли через соцсеть — укажите телефон, он нужен для бронирований
          </p>
        )}
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-success">{state.success}</p>}
      <Button type="submit" disabled={pending}>
        Сохранить
      </Button>
    </form>
  );
}
