import Link from "next/link";
import { Trophy, Gift, Clock, Users2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { ContentHeader } from "@/components/layout/content-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Программа лояльности" };
export const dynamic = "force-dynamic";

const TIER_NAMES: Record<string, string> = { BASE: "Базовый", SILVER: "Серебро", GOLD: "Золото", VIP: "VIP" };

export default async function LoyaltyPage() {
  const tiers = await prisma.loyaltyTier.findMany({ orderBy: { minVisits: "asc" } });

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
      <ContentHeader
        title="Баллы за каждое посещение"
        description="Баллы начисляются за количество визитов — не важно, сколько стоил квест."
      />

      <div className="grid gap-6 sm:grid-cols-3">
        <div className="rounded-xl border p-5 text-center">
          <Users2 className="mx-auto size-8 text-primary" />
          <h3 className="mt-3 font-semibold">100 баллов за визит</h3>
          <p className="mt-1 text-sm text-muted-foreground">Начисляются сразу после завершения квеста</p>
        </div>
        <div className="rounded-xl border p-5 text-center">
          <Gift className="mx-auto size-8 text-primary" />
          <h3 className="mt-3 font-semibold">1 балл = 1 ₽</h3>
          <p className="mt-1 text-sm text-muted-foreground">Можно оплатить до 50% стоимости следующей брони</p>
        </div>
        <div className="rounded-xl border p-5 text-center">
          <Clock className="mx-auto size-8 text-primary" />
          <h3 className="mt-3 font-semibold">Действуют 12 месяцев</h3>
          <p className="mt-1 text-sm text-muted-foreground">С момента последнего начисления</p>
        </div>
      </div>

      <h2 className="mt-14 text-center text-2xl font-bold">Уровни</h2>
      <p className="mt-2 text-center text-muted-foreground">
        Чем больше квестов пройдено, тем выше бонус к начислению баллов
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => (
          <Card key={tier.id}>
            <CardContent className="pt-6 text-center">
              <Trophy className="mx-auto size-7 text-primary" />
              <h3 className="mt-3 font-heading text-lg font-semibold">{TIER_NAMES[tier.level] ?? tier.level}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {tier.minVisits === 0 ? "С первого визита" : `От ${tier.minVisits} визитов`}
              </p>
              {tier.bonusPercent > 0 && (
                <p className="mt-2 text-sm font-medium text-primary">+{tier.bonusPercent}% к баллам</p>
              )}
              {tier.perks && <p className="mt-2 text-xs text-muted-foreground">{tier.perks}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-14 text-center">
        <Button size="lg" render={<Link href="/register" />}>
          Зарегистрироваться и начать копить баллы
        </Button>
      </div>
    </div>
  );
}
