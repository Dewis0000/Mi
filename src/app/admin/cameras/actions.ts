"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import type { CameraStatus } from "../../../../generated/enums";

export async function updateCameraAction(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const rtspUrl = String(formData.get("rtspUrl") ?? "").trim();
  const hlsUrl = String(formData.get("hlsUrl") ?? "").trim();
  const status = formData.get("status") as CameraStatus;

  await prisma.camera.update({
    where: { id },
    data: { label, rtspUrl: rtspUrl || null, hlsUrl: hlsUrl || null, status },
  });
  revalidatePath("/admin/cameras");
}

export async function addCameraAction(formData: FormData) {
  await requireManager();
  const roomId = String(formData.get("roomId") ?? "");
  const label = String(formData.get("label") ?? "").trim() || "Новая камера";
  if (!roomId) return;
  await prisma.camera.create({ data: { roomId, label, status: "OFFLINE" } });
  revalidatePath("/admin/cameras");
}
