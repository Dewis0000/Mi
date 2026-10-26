"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { checkoutAction } from "./actions";
import type { ActionState } from "@/app/(auth)/actions";
import type { OrderType } from "../../../../../generated/enums";

export function CheckoutForm({
  orderId,
  orderType,
  needsGuestInfo,
  hasPoints,
}: {
  orderId: string;
  orderType: OrderType;
  needsGuestInfo: boolean;
  hasPoints: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(checkoutAction, undefined);
  const isBooking = orderType === "BOOKING";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="orderId" value={orderId} />

      {needsGuestInfo && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="guestName">Имя</Label>
            <Input id="guestName" name="guestName" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guestPhone">Телефон</Label>
            <Input id="guestPhone" name="guestPhone" type="tel" placeholder="+7 900 000-00-00" required />
          </div>
        </div>
      )}

      {isBooking && (
        <div className="space-y-1.5">
          <Label htmlFor="promoCode">Промокод (необязательно)</Label>
          <Input id="promoCode" name="promoCode" placeholder="WELCOME10" />
        </div>
      )}

      {isBooking && hasPoints && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="usePoints" />
          Списать баллы (до 50% от суммы заказа)
        </label>
      )}

      {isBooking && (
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <Checkbox name="filmingConsent" className="mt-0.5" />
          <span>
            Согласен(на) на видеозапись и трансляцию игры с камер в комнате — это нужно, чтобы смотреть
            прямой эфир и купить видео на память после игры
          </span>
        </label>
      )}

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Обрабатываем оплату…" : "Оплатить"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Тестовый режим оплаты — реальное списание не происходит (см. раздел 9 архитектуры).
      </p>
    </form>
  );
}
