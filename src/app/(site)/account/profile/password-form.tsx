"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { changePasswordAction, type ProfileActionState } from "./actions";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<ProfileActionState, FormData>(changePasswordAction, undefined);

  return (
    <form action={formAction} className="space-y-4 rounded-xl border p-5">
      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">Текущий пароль</Label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="newPassword">Новый пароль</Label>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-success">{state.success}</p>}
      <Button type="submit" disabled={pending}>
        Изменить пароль
      </Button>
    </form>
  );
}
