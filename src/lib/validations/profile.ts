import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Введите имя").max(100),
  email: z.string().trim().email("Некорректный email").optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Введите текущий пароль"),
  newPassword: z.string().min(8, "Минимум 8 символов"),
});
