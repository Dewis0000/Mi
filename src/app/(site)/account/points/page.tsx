import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { getUserTier } from "@/lib/loyalty";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Баллы и история" };
export const dynamic = "force-dynamic";

const TIER_NAMES: Record<string, string> = { BASE: "Базовый", SILVER: "Серебро", GOLD: "Золото", VIP: "VIP" };
const TX_LABELS: Record<string, string> = {
  ACCRUAL: "Начисление",
  REDEMPTION: "Списание",
  EXPIRY: "Сгорание",
  ADMIN_ADJUSTMENT: "Корректировка",
  REFERRAL_BONUS: "Бонус за друга",
};

export default async function AccountPointsPage() {
  const user = await requireUser();

  const visits = await prisma.booking.count({ where: { userId: user.id, status: "COMPLETED" } });
  const tiers = await prisma.loyaltyTier.findMany({ orderBy: { minVisits: "asc" } });
  const currentTier = await getUserTier(visits);
  const nextTier = tiers.find((t) => t.minVisits > visits);

  const transactions = await prisma.pointsTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Баллы и история</h1>

      <div className="mt-6 rounded-xl border p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Текущий баланс</p>
            <p className="text-3xl font-bold">{user.pointsBalance} баллов</p>
          </div>
          <Badge variant="outline" className="text-base">
            {currentTier ? TIER_NAMES[currentTier.level] : "Базовый"}
          </Badge>
        </div>

        {nextTier && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Визитов: {visits}</span>
              <span>
                До уровня «{TIER_NAMES[nextTier.level]}»: {nextTier.minVisits - visits}
              </span>
            </div>
            <Progress value={(visits / nextTier.minVisits) * 100} className="mt-2" />
          </div>
        )}
      </div>

      <h2 className="mt-8 text-lg font-semibold">История операций</h2>
      <div className="mt-3 space-y-2">
        {transactions.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <div>
              <p>{TX_LABELS[tx.type] ?? tx.type}</p>
              {tx.note && <p className="text-xs text-muted-foreground">{tx.note}</p>}
              <p className="text-xs text-muted-foreground">
                {tx.createdAt.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
            </div>
            <span className={tx.amount >= 0 ? "font-medium text-success" : "font-medium text-destructive"}>
              {tx.amount >= 0 ? "+" : ""}
              {tx.amount}
            </span>
          </div>
        ))}
        {transactions.length === 0 && <p className="text-muted-foreground">Операций пока нет.</p>}
      </div>
    </div>
  );
}
