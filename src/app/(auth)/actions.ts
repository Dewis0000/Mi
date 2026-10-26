"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signIn, signOut } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { loginSchema, registerSchema } from "@/lib/validations/auth";
import { awardPointsForBooking } from "@/lib/loyalty";

export type ActionState = { error?: string } | undefined;

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email") || "",
    password: formData.get("password"),
    dataConsent: formData.get("dataConsent") === "on",
    marketingConsent: formData.get("marketingConsent") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте данные формы" };
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    return { error: "Некорректный номер телефона" };
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return { error: "Пользователь с таким телефоном уже зарегистрирован" };
  }

  if (parsed.data.email) {
    const existingEmail = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existingEmail) {
      return { error: "Пользователь с таким email уже зарегистрирован" };
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  // Упрощение для MVP: телефон считается подтверждённым сразу при регистрации.
  // В продакшене здесь должен быть шаг с SMS-кодом (см. docs/ARCHITECTURE.md, раздел 3).
  const newUser = await prisma.user.create({
    data: {
      name: parsed.data.name,
      phone,
      email: parsed.data.email || undefined,
      passwordHash,
      phoneVerifiedAt: new Date(),
      dataConsentAt: new Date(),
      marketingConsent: parsed.data.marketingConsent ?? false,
    },
  });

  // Если этим телефоном уже бронировали как гость — привязываем старые бронирования
  // и задним числом начисляем баллы за уже завершённые визиты (docs/ARCHITECTURE.md, раздел 3).
  const guestBookings = await prisma.booking.findMany({ where: { guestPhone: phone, userId: null } });
  for (const guestBooking of guestBookings) {
    await prisma.booking.update({ where: { id: guestBooking.id }, data: { userId: newUser.id } });
    if (guestBooking.status === "COMPLETED") {
      await awardPointsForBooking(guestBooking.id);
    }
  }

  await signIn("credentials", {
    phone: parsed.data.phone,
    password: parsed.data.password,
    redirectTo: "/account",
  });
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    phone: formData.get("phone"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте данные формы" };
  }

  try {
    await signIn("credentials", {
      phone: parsed.data.phone,
      password: parsed.data.password,
      redirectTo: "/account",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Неверный телефон или пароль" };
    }
    throw error;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
