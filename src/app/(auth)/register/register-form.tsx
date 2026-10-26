"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { registerAction, type ActionState } from "../actions";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(registerAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="name">Имя</Label>
        <Input id="name" name="name" autoComplete="name" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Телефон</Label>
        <Input id="phone" name="phone" type="tel" placeholder="+7 900 000-00-00" autoComplete="tel" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email (необязательно)</Label>
        <Input id="email" name="email" type="email" autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Пароль</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>

      <div className="space-y-2 pt-1">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox name="dataConsent" required className="mt-0.5" />
          <span>
            Согласен(на) с{" "}
            <Link href="/legal/offer" className="underline underline-offset-4 hover:text-foreground" target="_blank">
              публичной офертой
            </Link>{" "}
            и{" "}
            <Link href="/legal/privacy" className="underline underline-offset-4 hover:text-foreground" target="_blank">
              обработкой персональных данных
            </Link>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <Checkbox name="marketingConsent" className="mt-0.5" />
          <span>Хочу получать акции и новости о квестах</span>
        </label>
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Создаём аккаунт…" : "Зарегистрироваться"}
      </Button>
    </form>
  );
}
