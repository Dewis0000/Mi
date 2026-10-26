"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";

export async function createRecordingOrderAction(recordingId: string) {
  const user = await requireUser();
  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
    include: { booking: true, purchase: { include: { order: true } } },
  });

  if (!recording || recording.booking.userId !== user.id) return { error: "Запись не найдена" };
  if (recording.status !== "READY") return { error: "Запись ещё готовится" };

  if (recording.purchase) {
    if (recording.purchase.order?.status === "PAID") return { error: "Вы уже купили эту запись" };
    if (recording.purchase.order) return { orderId: recording.purchase.order.id };
  }

  const purchase = await prisma.recordingPurchase.create({ data: { recordingId, userId: user.id } });
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      type: "RECORDING",
      recordingPurchaseId: purchase.id,
      amount: recording.price,
      status: "PENDING",
    },
  });

  return { orderId: order.id };
}
