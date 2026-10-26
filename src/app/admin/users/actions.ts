"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireManager, requireAdmin } from "@/lib/current-user";

export async function adjustPointsAction(_prev: { error?: string; success?: string } | undefined, formData: FormData) {
  const actor = await requireManager();
  const userId = String(formData.get("userId") ?? "");
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim();

  if (!userId || !Number.isFinite(amount) || amount === 0) {
    return { error: "Укажите сумму корректировки" };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Пользователь не найден" };

  const newBalance = user.pointsBalance + amount;
  if (newBalance < 0) return { error: "Баланс не может быть отрицательным" };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { pointsBalance: newBalance } });
    await tx.pointsTransaction.create({
      data: {
        userId,
        type: "ADMIN_ADJUSTMENT",
        amount,
        balanceAfter: newBalance,
        note: note || `Ручная корректировка (${actor.name})`,
      },
    });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: "points.adjust", targetType: "User", targetId: userId, metadata: { amount, note } },
    });
  });

  revalidatePath(`/admin/users/${userId}`);
  return { success: "Баланс обновлён" };
}

export async function anonymizeUserAction(userId: string) {
  const actor = await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: {
      name: "Удалённый пользователь",
      email: null,
      phone: `deleted:${userId}`,
      passwordHash: null,
      avatarUrl: null,
      marketingConsent: false,
    },
  });
  await prisma.auditLog.create({
    data: { actorId: actor.id, action: "user.anonymize", targetType: "User", targetId: userId },
  });
  revalidatePath(`/admin/users/${userId}`);
}
