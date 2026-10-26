import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SocialButtons } from "@/components/auth/social-buttons";
import { LoginForm } from "./login-form";

export const metadata = { title: "Вход" };

export default function LoginPage() {
  const vkEnabled = Boolean(process.env.AUTH_VK_ID && process.env.AUTH_VK_SECRET);
  const yandexEnabled = Boolean(process.env.AUTH_YANDEX_ID && process.env.AUTH_YANDEX_SECRET);
  const telegramBotUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Вход в личный кабинет</CardTitle>
        <CardDescription>Баллы, бронирования и видео с квестов — в одном месте</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SocialButtons vk={vkEnabled} yandex={yandexEnabled} telegramBotUsername={telegramBotUsername} />
        {(vkEnabled || yandexEnabled) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> или по телефону
            <div className="h-px flex-1 bg-border" />
          </div>
        )}
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          Нет аккаунта?{" "}
          <Link href="/register" className="text-primary underline-offset-4 hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
