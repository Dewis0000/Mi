"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateSlotsAction } from "../actions";

export function GenerateSlotsButton({ roomId }: { roomId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await generateSlotsAction(roomId);
      if (result?.error) toast.error(result.error);
      else toast.success(result?.success ?? "Готово");
    });
  }

  return (
    <Button variant="outline" disabled={isPending} onClick={handleClick}>
      {isPending ? "Генерируем…" : "Сгенерировать слоты на 14 дней"}
    </Button>
  );
}
