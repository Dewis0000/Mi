import { prisma } from "@/lib/db";

// Баллы начисляются за количество визитов, а не за сумму покупки — docs/ARCHITECTURE.md, раздел 5.
const BASE_POINTS_PER_VISIT = 100;

// Начисляет баллы за завершённый визит. Идемпотентна: повторный вызов для той же
// брони ничего не начислит. Ничего не делает для гостевых бронирований без userId.
export async function awardPointsForBooking(bookingId: string) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking || !booking.userId) return null;

    const already = await tx.pointsTransaction.findFirst({ where: { bookingId, type: "ACCRUAL" } });
    if (already) return null;

    const visitsBefore = await tx.booking.count({
      where: { userId: booking.userId, status: "COMPLETED", id: { not: bookingId } },
    });
    const tiers = await tx.loyaltyTier.findMany({ orderBy: { minVisits: "desc" } });
    const tier = tiers.find((t) => visitsBefore >= t.minVisits);
    const bonusPercent = tier?.bonusPercent ?? 0;
    const amount = Math.round(BASE_POINTS_PER_VISIT * (1 + bonusPercent / 100));

    const user = await tx.user.update({
      where: { id: booking.userId },
      data: { pointsBalance: { increment: amount } },
    });

    await tx.pointsTransaction.create({
      data: {
        userId: booking.userId,
        type: "ACCRUAL",
        amount,
        balanceAfter: user.pointsBalance,
        bookingId,
        note: "Начисление за посещение квеста",
      },
    });

    return amount;
  });
}

export async function completeBooking(bookingId: string) {
  await prisma.booking.update({ where: { id: bookingId }, data: { status: "COMPLETED" } });
  await awardPointsForBooking(bookingId);
}

export async function getUserTier(visits: number) {
  const tiers = await prisma.loyaltyTier.findMany({ orderBy: { minVisits: "desc" } });
  return tiers.find((t) => visits >= t.minVisits) ?? null;
}
