"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const schema = z.object({
  email: z.string().email("Введите email, похожий на настоящий"),
  password: z.string().min(1, "Пароль нужен. Даже неправильный — просто введите что-то"),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function onSubmit(values: FormValues) {
    toast.success(`С возвращением, ${values.email.split("@")[0]}!`);
    router.push("/dashboard");
  }

  return (
    <Card className="w-full">
      <CardHeader className="items-center text-center">
        <CardTitle className="font-display text-2xl">С возвращением</CardTitle>
        <CardDescription>
          Зал Позора скучал. Или не скучал — зависит от твоей прошлой игры.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Пароль</Label>
              <span className="text-xs text-muted-foreground">
                Забыли? Мы тоже.
              </span>
            </div>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting} className="glow-primary mt-1">
            {isSubmitting ? "Входим…" : "Войти"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Еще не выпендривались?{" "}
          <Link href="/register" className="text-primary underline-offset-4 hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
