import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/current-user";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Журнал действий" };
export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  "points.adjust": "Корректировка баллов",
  "user.anonymize": "Удаление персональных данных",
  "order.refund": "Возврат платежа",
  "user.role_change": "Изменение роли",
};

export default async function AdminAuditPage() {
  await requireAdmin();
  const logs = await prisma.auditLog.findMany({
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Журнал действий</h1>
      <p className="mt-1 text-muted-foreground">Чувствительные действия администраторов — корректировки баллов, возвраты, изменения ролей, удаление данных.</p>

      <div className="mt-6 space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <div>
              <Badge variant="outline">{ACTION_LABELS[log.action] ?? log.action}</Badge>
              <span className="ml-2 text-muted-foreground">
                {log.actor?.name ?? "Система"} · {log.targetType} {log.targetId?.slice(0, 8)}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {log.createdAt.toLocaleString("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
        {logs.length === 0 && <p className="text-muted-foreground">Записей пока нет.</p>}
      </div>
    </div>
  );
}
