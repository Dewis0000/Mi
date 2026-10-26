import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/current-user";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateTierAction } from "./actions";

export const metadata = { title: "Лояльность" };
export const dynamic = "force-dynamic";

const TIER_NAMES: Record<string, string> = { BASE: "Базовый", SILVER: "Серебро", GOLD: "Золото", VIP: "VIP" };

export default async function AdminLoyaltyPage() {
  await requireAdmin();
  const tiers = await prisma.loyaltyTier.findMany({ orderBy: { minVisits: "asc" } });

  return (
    <div>
      <h1 className="text-2xl font-bold">Программа лояльности</h1>
      <p className="mt-1 text-muted-foreground">
        Базовое начисление — 100 баллов за визит. Здесь настраиваются пороги уровней и бонусы к начислению.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {tiers.map((tier) => (
          <form key={tier.id} action={updateTierAction} className="space-y-3 rounded-xl border p-5">
            <input type="hidden" name="id" value={tier.id} />
            <h2 className="font-semibold">{TIER_NAMES[tier.level] ?? tier.level}</h2>
            <div className="space-y-1.5">
              <Label>Визитов для перехода</Label>
              <Input name="minVisits" type="number" min={0} defaultValue={tier.minVisits} />
            </div>
            <div className="space-y-1.5">
              <Label>Бонус к начислению, %</Label>
              <Input name="bonusPercent" type="number" min={0} defaultValue={tier.bonusPercent} />
            </div>
            <div className="space-y-1.5">
              <Label>Привилегии (текст)</Label>
              <Input name="perks" defaultValue={tier.perks ?? ""} />
            </div>
            <Button type="submit" size="sm">
              Сохранить
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}
