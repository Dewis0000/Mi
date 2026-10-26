"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { normalizePhone, isPendingPhone } from "@/lib/phone";
import { updateProfileSchema, changePasswordSchema } from "@/lib/validations/profile";

export type ProfileActionState = { error?: string; success?: string } | undefined;

export async function updateProfileAction(_prev: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const user = await requireUser();
  const parsed = updateProfileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") || "",
    phone: formData.get("phone") || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте данные" };

  const data: { name: string; email?: string; phone?: string; phoneVerifiedAt?: Date } = { name: parsed.data.name };
  if (parsed.data.email) data.email = parsed.data.email;

  if (isPendingPhone(user.phone) && parsed.data.phone) {
    const normalized = normalizePhone(parsed.data.phone);
    if (!normalized) return { error: "Некорректный номер телефона" };
    const existing = await prisma.user.findUnique({ where: { phone: normalized } });
    if (existing && existing.id !== user.id) return { error: "Этот телефон уже привязан к другому аккаунту" };
    data.phone = normalized;
    data.phoneVerifiedAt = new Date();
  }

  await prisma.user.update({ where: { id: user.id }, data });
  revalidatePath("/account/profile");
  return { success: "Профиль обновлён" };
}

export async function changePasswordAction(_prev: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте данные" };

  if (!user.passwordHash) {
    return { error: "Для этого аккаунта пароль не задан — вы вошли через соцсеть" };
  }
  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { error: "Текущий пароль указан неверно" };

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
  return { success: "Пароль изменён" };
}
