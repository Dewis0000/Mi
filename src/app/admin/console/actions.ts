"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/current-user";
import { completeBooking } from "@/lib/loyalty";

export async function searchBookingsAction(query: string) {
  await requireStaff();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date();
  dayEnd.setHours(23, 59, 59, 999);

  const trimmed = query.trim();
  if (!trimmed) {
    return prisma.booking.findMany({
      where: { slot: { startsAt: { gte: dayStart, lte: dayEnd } }, status: { notIn: ["CANCELLED", "REFUNDED"] } },
      include: { slot: { include: { room: true } }, user: true, liveSession: true },
      orderBy: { slot: { startsAt: "asc" } },
    });
  }

  return prisma.booking.findMany({
    where: {
      slot: { startsAt: { gte: dayStart, lte: dayEnd } },
      OR: [
        { code: { contains: trimmed } },
        { guestPhone: { contains: trimmed } },
        { guestName: { contains: trimmed } },
        { user: { phone: { contains: trimmed } } },
        { user: { name: { contains: trimmed } } },
      ],
    },
    include: { slot: { include: { room: true } }, user: true, liveSession: true },
    orderBy: { slot: { startsAt: "asc" } },
  });
}

export async function checkInAction(bookingId: string) {
  await requireStaff();
  await prisma.booking.update({ where: { id: bookingId }, data: { status: "CHECKED_IN" } });
  revalidatePath("/admin/console");
}

export async function startGameAction(bookingId: string) {
  await requireStaff();
  const booking = await prisma.booking.update({ where: { id: bookingId }, data: { status: "IN_PROGRESS" } });

  if (booking.filmingConsent) {
    const camera = await prisma.camera.findFirst({ where: { roomId: (await prisma.slot.findUnique({ where: { id: booking.slotId } }))!.roomId } });
    if (camera) {
      await prisma.liveSession.upsert({
        where: { bookingId },
        update: { status: "LIVE", startedAt: new Date(), endedAt: null },
        create: { bookingId, cameraId: camera.id, status: "LIVE", startedAt: new Date() },
      });
    }
  }
  revalidatePath("/admin/console");
}

export async function completeBookingAction(bookingId: string) {
  await requireStaff();
  await completeBooking(bookingId);
  await prisma.liveSession.updateMany({ where: { bookingId }, data: { status: "ENDED", endedAt: new Date() } });

  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { slot: true } });
  if (booking?.filmingConsent) {
    const camera = await prisma.camera.findFirst({ where: { roomId: booking.slot.roomId } });
    await prisma.recording.upsert({
      where: { bookingId },
      update: {},
      create: { bookingId, cameraId: camera?.id, status: "PROCESSING", price: 490 },
    });
  }
  revalidatePath("/admin/console");
}

export async function noShowAction(bookingId: string) {
  await requireStaff();
  await prisma.booking.update({ where: { id: bookingId }, data: { status: "NO_SHOW" } });
  revalidatePath("/admin/console");
}
