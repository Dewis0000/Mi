"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { normalizePhone } from "@/lib/phone";
import { calculatePrice } from "@/lib/booking";

function generateBookingCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "QC-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function adminCancelBookingAction(bookingId: string) {
  await requireManager();
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { error: "Бронирование не найдено" };

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED", cancelReason: "Отменено администратором" } });
    await tx.slot.update({ where: { id: booking.slotId }, data: { status: "OPEN", holdExpiresAt: null } });
  });

  revalidatePath("/admin/bookings");
  return { success: true };
}

export async function createManualBookingAction(_prev: { error?: string } | undefined, formData: FormData) {
  await requireManager();

  const slotId = String(formData.get("slotId") ?? "");
  const playersCount = Number(formData.get("playersCount"));
  const guestName = String(formData.get("guestName") ?? "").trim();
  const phoneInput = String(formData.get("guestPhone") ?? "");
  const guestPhone = normalizePhone(phoneInput);

  if (!slotId) return { error: "Выберите слот" };
  if (!guestName || !guestPhone) return { error: "Укажите имя и телефон" };

  const slot = await prisma.slot.findUnique({ where: { id: slotId }, include: { room: true } });
  if (!slot || slot.status !== "OPEN") return { error: "Слот недоступен" };
  if (playersCount < slot.room.minPlayers || playersCount > slot.room.maxPlayers) {
    return { error: `Игроков должно быть от ${slot.room.minPlayers} до ${slot.room.maxPlayers}` };
  }

  const priceTotal = calculatePrice(slot.room.basePrice, slot.room.extraPlayerPrice, slot.room.minPlayers, playersCount);

  const existingUser = await prisma.user.findUnique({ where: { phone: guestPhone } });

  await prisma.$transaction(async (tx) => {
    await tx.slot.update({ where: { id: slot.id }, data: { status: "BOOKED" } });
    await tx.booking.create({
      data: {
        code: generateBookingCode(),
        slotId: slot.id,
        userId: existingUser?.id,
        guestName: existingUser ? undefined : guestName,
        guestPhone: existingUser ? undefined : guestPhone,
        playersCount,
        priceTotal,
        status: "CONFIRMED",
      },
    });
  });

  revalidatePath("/admin/bookings");
  return { success: "Бронирование создано (оплата собрана вне системы — например, наличными)" };
}
