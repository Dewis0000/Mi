"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/current-user";
import { normalizePhone } from "@/lib/phone";
import type { UserRole } from "../../../../generated/enums";

export type StaffActionState = { error?: string; success?: string } | undefined;

export async function promoteStaffAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const actor = await requireAdmin();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const role = formData.get("role") as UserRole;
  const locationId = String(formData.get("locationId") ?? "") || undefined;

  if (!phone) return { error: "Укажите телефон сотрудника — он должен быть уже зарегистрирован на сайте" };

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return { error: "Пользователь с таким телефоном не найден — попросите его зарегистрироваться" };

  await prisma.user.update({ where: { id: user.id }, data: { role, locationId } });
  await prisma.auditLog.create({
    data: { actorId: actor.id, action: "user.role_change", targetType: "User", targetId: user.id, metadata: { role } },
  });

  revalidatePath("/admin/staff");
  return { success: `${user.name} теперь ${role}` };
}

export async function demoteStaffAction(userId: string) {
  const actor = await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { role: "CUSTOMER", locationId: null } });
  await prisma.auditLog.create({
    data: { actorId: actor.id, action: "user.role_change", targetType: "User", targetId: userId, metadata: { role: "CUSTOMER" } },
  });
  revalidatePath("/admin/staff");
}
