"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { togglePromoCodeAction } from "./actions";

export function PromoRow({ promo }: { promo: { id: string; code: string; type: string; value: number; usedCount: number; maxUses: number | null; isActive: boolean } }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
      <div>
        <p className="font-mono font-medium">{promo.code}</p>
        <p className="text-sm text-muted-foreground">
          {promo.type === "PERCENT" ? `-${promo.value}%` : `-${promo.value} ₽`} · использован {promo.usedCount}
          {promo.maxUses ? ` из ${promo.maxUses}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={promo.isActive ? "default" : "outline"}>{promo.isActive ? "Активен" : "Выключен"}</Badge>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => startTransition(() => togglePromoCodeAction(promo.id, promo.isActive))}
        >
          {promo.isActive ? "Выключить" : "Включить"}
        </Button>
      </div>
    </div>
  );
}
