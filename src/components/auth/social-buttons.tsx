"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { TelegramLoginButton } from "@/components/auth/telegram-login-button";

export function SocialButtons({
  vk,
  yandex,
  telegramBotUsername,
  callbackUrl,
}: {
  vk: boolean;
  yandex: boolean;
  telegramBotUsername?: string;
  callbackUrl?: string;
}) {
  if (!vk && !yandex && !telegramBotUsername) return null;

  return (
    <div className="grid gap-2">
      {telegramBotUsername && (
        <div className="flex justify-center">
          <TelegramLoginButton botUsername={telegramBotUsername} />
        </div>
      )}
      {vk && (
        <Button
          type="button"
          variant="outline"
          onClick={() => signIn("vk", { redirectTo: callbackUrl ?? "/account" })}
        >
          Войти через VK ID
        </Button>
      )}
      {yandex && (
        <Button
          type="button"
          variant="outline"
          onClick={() => signIn("yandex", { redirectTo: callbackUrl ?? "/account" })}
        >
          Войти через Яндекс ID
        </Button>
      )}
    </div>
  );
}
