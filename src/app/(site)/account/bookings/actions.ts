"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";

export async function cancelBookingAction(bookingId: string) {
  const user = await requireUser();
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { slot: true } });
  if (!booking || booking.userId !== user.id) return { error: "Бронирование не найдено" };
  if (booking.status !== "CONFIRMED" && booking.status !== "PENDING_PAYMENT") {
    return { error: "Это бронирование нельзя отменить" };
  }

  const hoursUntil = (booking.slot.startsAt.getTime() - Date.now()) / 3_600_000;
  if (hoursUntil < 24) {
    return { error: "Бесплатная отмена возможна не позднее чем за 24 часа до начала квеста" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED", cancelReason: "Отменено пользователем" },
    });
    await tx.slot.update({ where: { id: booking.slotId }, data: { status: "OPEN", holdExpiresAt: null } });
  });

  revalidatePath("/account/bookings");
  return { success: true };
}
