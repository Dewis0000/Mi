"use server";

import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";

export async function getOpenSlotsAction(roomId: string) {
  await requireManager();
  const slots = await prisma.slot.findMany({
    where: { roomId, status: "OPEN", startsAt: { gt: new Date() } },
    orderBy: { startsAt: "asc" },
    take: 60,
  });
  return slots.map((s) => ({ id: s.id, startsAt: s.startsAt.toISOString() }));
}
