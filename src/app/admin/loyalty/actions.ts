"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/current-user";

export async function updateTierAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const minVisits = Number(formData.get("minVisits"));
  const bonusPercent = Number(formData.get("bonusPercent"));
  const perks = String(formData.get("perks") ?? "").trim();

  await prisma.loyaltyTier.update({ where: { id }, data: { minVisits, bonusPercent, perks: perks || null } });
  revalidatePath("/admin/loyalty");
}
