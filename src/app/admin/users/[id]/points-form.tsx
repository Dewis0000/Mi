"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { adjustPointsAction } from "../actions";

export function PointsForm({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState<{ error?: string; success?: string } | undefined, FormData>(
    adjustPointsAction,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      <Input name="amount" type="number" placeholder="+100 или -50" className="w-32" required />
      <Input name="note" placeholder="Причина корректировки" className="w-56" />
      <Button type="submit" disabled={pending}>
        Применить
      </Button>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-success">{state.success}</p>}
    </form>
  );
}
