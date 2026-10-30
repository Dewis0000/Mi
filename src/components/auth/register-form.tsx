"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AvatarPicker } from "@/components/avatar-picker";
import { avatarOptions } from "@/lib/demo-data";

const schema = z
  .object({
    name: z.string().min(2, "Имя должно быть не короче 2 символов"),
    email: z.string().email("Введите email, похожий на настоящий"),
    password: z
      .string()
      .min(6, "Минимум 6 символов. «123456» подходит, но мы осуждаем"),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Пароли не совпадают",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const [avatar, setAvatar] = useState(avatarOptions[0]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function onSubmit(values: FormValues) {
    toast.success(`Добро пожаловать, ${values.name}! ${avatar}`, {
      description: "Профиль создан. Пора идти выпендриваться.",
    });
    router.push("/dashboard");
  }

  return (
    <Card className="w-full">
      <CardHeader className="items-center text-center">
        <CardTitle className="font-display text-2xl">
          Создать профиль выпендрёжника
        </CardTitle>
        <CardDescription>
          Займёт меньше времени, чем выбор названия команды.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Имя</Label>
            <Input id="name" placeholder="Например, Витя Скромный" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Пароль</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">Повторите пароль</Label>
            <Input id="confirm" type="password" {...register("confirm")} />
            {errors.confirm && (
              <p className="text-xs text-destructive">{errors.confirm.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Выбери аватар (это важно, честно)</Label>
            <AvatarPicker value={avatar} onChange={setAvatar} />
          </div>

          <Button type="submit" disabled={isSubmitting} className="glow-primary mt-1">
            {isSubmitting ? "Создаём…" : "Зарегистрироваться"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Уже выпендривался у нас?{" "}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Войти
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
