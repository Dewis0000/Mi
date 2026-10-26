"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { anonymizeUserAction } from "../actions";

export function AnonymizeButton({ userId }: { userId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
        Удалить персональные данные
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Подтвердите — действие необратимо</span>
      <Button
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await anonymizeUserAction(userId);
            toast.success("Данные анонимизированы");
            setConfirming(false);
          })
        }
      >
        Да, удалить
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Отмена
      </Button>
    </div>
  );
}
