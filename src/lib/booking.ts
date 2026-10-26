import { prisma } from "@/lib/db";

export const HOLD_MINUTES = 15;

export class BookingError extends Error {}

function generateBookingCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "QC-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Снимает "мягкую блокировку" со слотов, чей резерв истёк, и отменяет связанные
// неоплаченные брони — защита от двойного бронирования (docs/ARCHITECTURE.md, раздел 6).
export async function releaseExpiredHolds(roomId?: string) {
  const expiredSlots = await prisma.slot.findMany({
    where: {
      status: "HELD",
      holdExpiresAt: { lt: new Date() },
      ...(roomId ? { roomId } : {}),
    },
    include: { booking: true },
  });

  for (const slot of expiredSlots) {
    await prisma.$transaction(async (tx) => {
      if (slot.booking && slot.booking.status === "PENDING_PAYMENT") {
        await tx.booking.update({
          where: { id: slot.booking.id },
          data: { status: "CANCELLED", cancelReason: "Истёк срок удержания слота" },
        });
      }
      await tx.slot.update({ where: { id: slot.id }, data: { status: "OPEN", holdExpiresAt: null } });
    });
  }
}

export function calculatePrice(basePrice: number, extraPlayerPrice: number, minPlayers: number, playersCount: number) {
  return basePrice + Math.max(0, playersCount - minPlayers) * extraPlayerPrice;
}

// Генерирует слоты на N дней вперёд по шаблону расписания комнаты (docs/ARCHITECTURE.md, раздел 6).
export async function generateSlotsForRoom(roomId: string, days = 14) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, include: { scheduleTemplates: true } });
  if (!room) throw new BookingError("Квест не найден");
  if (room.scheduleTemplates.length === 0) throw new BookingError("Для этого квеста не задан шаблон расписания");

  const stepMinutes = room.durationMinutes + room.cleanupMinutes;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let created = 0;

  for (let day = 0; day <= days; day++) {
    const date = new Date(now);
    date.setDate(date.getDate() + day);
    const template = room.scheduleTemplates.find((t) => t.weekday === date.getDay() && t.isActive);
    if (!template) continue;

    const [startHour, startMinute] = template.startTime.split(":").map(Number);
    const [endHour, endMinute] = template.endTime.split(":").map(Number);
    const dayStart = new Date(date);
    dayStart.setHours(startHour, startMinute, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(endHour, endMinute, 0, 0);

    let slotStart = new Date(dayStart);
    while (slotStart.getTime() + room.durationMinutes * 60_000 <= dayEnd.getTime()) {
      if (slotStart.getTime() > Date.now()) {
        const slotEnd = new Date(slotStart.getTime() + room.durationMinutes * 60_000);
        const existing = await prisma.slot.findUnique({ where: { roomId_startsAt: { roomId, startsAt: slotStart } } });
        if (!existing) {
          await prisma.slot.create({ data: { roomId, startsAt: new Date(slotStart), endsAt: slotEnd, status: "OPEN" } });
          created++;
        }
      }
      slotStart = new Date(slotStart.getTime() + stepMinutes * 60_000);
    }
  }

  return created;
}

export async function createBooking({
  slotId,
  playersCount,
  userId,
}: {
  slotId: string;
  playersCount: number;
  userId?: string;
}) {
  await releaseExpiredHolds();

  return prisma.$transaction(async (tx) => {
    const slot = await tx.slot.findUnique({ where: { id: slotId }, include: { room: true } });
    if (!slot) throw new BookingError("Слот не найден");
    if (slot.status !== "OPEN") throw new BookingError("Этот слот уже занят — выберите другое время");
    if (playersCount < slot.room.minPlayers || playersCount > slot.room.maxPlayers) {
      throw new BookingError(
        `Количество игроков должно быть от ${slot.room.minPlayers} до ${slot.room.maxPlayers}`
      );
    }

    const priceTotal = calculatePrice(slot.room.basePrice, slot.room.extraPlayerPrice, slot.room.minPlayers, playersCount);

    await tx.slot.update({
      where: { id: slot.id },
      data: { status: "HELD", holdExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000) },
    });

    const booking = await tx.booking.create({
      data: {
        code: generateBookingCode(),
        slotId: slot.id,
        userId,
        playersCount,
        priceTotal,
        status: "PENDING_PAYMENT",
      },
    });

    const order = await tx.order.create({
      data: {
        userId,
        type: "BOOKING",
        bookingId: booking.id,
        amount: priceTotal,
        status: "PENDING",
      },
    });

    return { booking, order };
  });
}
