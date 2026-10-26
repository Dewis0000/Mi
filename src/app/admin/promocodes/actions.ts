"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import type { PromoCodeType } from "../../../../generated/enums";

export async function createPromoCodeAction(formData: FormData) {
  await requireManager();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const type = formData.get("type") as PromoCodeType;
  const value = Number(formData.get("value"));
  const maxUsesRaw = String(formData.get("maxUses") ?? "").trim();

  if (!code || !Number.isFinite(value)) return;

  await prisma.promoCode.create({
    data: { code, type, value, maxUses: maxUsesRaw ? Number(maxUsesRaw) : null },
  });
  revalidatePath("/admin/promocodes");
}

export async function togglePromoCodeAction(id: string, isActive: boolean) {
  await requireManager();
  await prisma.promoCode.update({ where: { id }, data: { isActive: !isActive } });
  revalidatePath("/admin/promocodes");
}
