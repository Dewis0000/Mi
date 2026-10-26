import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Введите имя").max(100),
  phone: z.string().trim().min(10, "Введите номер телефона"),
  email: z.string().trim().email("Некорректный email").optional().or(z.literal("")),
  password: z.string().min(8, "Минимум 8 символов"),
  dataConsent: z.boolean().refine((v) => v === true, "Нужно согласие на обработку данных"),
  marketingConsent: z.boolean().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  phone: z.string().trim().min(10, "Введите номер телефона"),
  password: z.string().min(1, "Введите пароль"),
});

export type LoginInput = z.infer<typeof loginSchema>;
