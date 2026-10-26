"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";

export async function markRecordingReadyAction(recordingId: string) {
  await requireManager();
  await prisma.recording.update({
    where: { id: recordingId },
    data: { status: "READY", expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  });
  revalidatePath("/admin/videos");
}

export async function revokeRecordingAccessAction(recordingId: string) {
  await requireManager();
  await prisma.recordingPurchase.deleteMany({ where: { recordingId } });
  revalidatePath("/admin/videos");
}

export async function updateRecordingPriceAction(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const price = Number(formData.get("price"));
  if (!id || !Number.isFinite(price)) return;
  await prisma.recording.update({ where: { id }, data: { price } });
  revalidatePath("/admin/videos");
}
