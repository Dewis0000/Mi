import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/room-labels";
import { createPromoCodeAction } from "./actions";
import { PromoRow } from "./promo-row";

export const metadata = { title: "Промокоды и сертификаты" };
export const dynamic = "force-dynamic";

export default async function AdminPromoCodesPage() {
  await requireManager();
  const [promoCodes, certificates] = await Promise.all([
    prisma.promoCode.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.giftCertificate.findMany({ include: { order: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Промокоды и сертификаты</h1>

      <form action={createPromoCodeAction} className="mt-6 flex flex-wrap items-end gap-2 rounded-lg border p-4">
        <div className="space-y-1.5">
          <Label>Код</Label>
          <Input name="code" placeholder="SUMMER15" className="w-36 uppercase" required />
        </div>
        <div className="space-y-1.5">
          <Label>Тип</Label>
          <Select name="type" defaultValue="PERCENT">
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PERCENT">% скидка</SelectItem>
              <SelectItem value="FIXED">₽ скидка</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Значение</Label>
          <Input name="value" type="number" min={1} className="w-24" required />
        </div>
        <div className="space-y-1.5">
          <Label>Лимит использований</Label>
          <Input name="maxUses" type="number" min={1} className="w-32" placeholder="Без лимита" />
        </div>
        <Button type="submit">Создать</Button>
      </form>

      <div className="mt-4 space-y-2">
        {promoCodes.map((promo) => (
          <PromoRow key={promo.id} promo={promo} />
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold">Купленные сертификаты</h2>
      <div className="mt-3 space-y-2">
        {certificates.map((cert) => (
          <div key={cert.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <span className="font-mono">{cert.code}</span>
            <span>
              {formatPrice(cert.balance)} / {formatPrice(cert.amount)}
            </span>
            <Badge variant={cert.order?.status === "PAID" ? "default" : "outline"}>{cert.order?.status ?? "—"}</Badge>
          </div>
        ))}
        {certificates.length === 0 && <p className="text-sm text-muted-foreground">Сертификатов пока нет.</p>}
      </div>
    </div>
  );
}
