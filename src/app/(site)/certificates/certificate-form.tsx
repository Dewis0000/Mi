"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCertificateOrderAction } from "./actions";
import { formatPrice } from "@/lib/room-labels";

const PRESETS = [2000, 3500, 5000];

export function CertificateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState(3500);

  function handleSubmit(formData: FormData) {
    formData.set("amount", String(amount));
    startTransition(async () => {
      const result = await createCertificateOrderAction(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      if (result?.orderId) router.push(`/checkout/${result.orderId}`);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4 rounded-xl border p-5">
      <div>
        <Label>Сумма сертификата</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={amount === preset ? "default" : "outline"}
              onClick={() => setAmount(preset)}
            >
              {formatPrice(preset)}
            </Button>
          ))}
          <Input
            type="number"
            min={500}
            step={100}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-28"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="purchaserEmail">Ваш email</Label>
        <Input id="purchaserEmail" name="purchaserEmail" type="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="recipientName">Имя получателя (необязательно)</Label>
        <Input id="recipientName" name="recipientName" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="message">Поздравление (необязательно)</Label>
        <Textarea id="message" name="message" rows={3} />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? "Оформляем…" : `Купить за ${formatPrice(amount)}`}
      </Button>
    </form>
  );
}
