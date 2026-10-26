"use client";

import { useEffect, useRef } from "react";
import { signIn } from "next-auth/react";
import type { TelegramAuthPayload } from "@/lib/auth-providers/telegram";

// Требует NEXT_PUBLIC_TELEGRAM_BOT_USERNAME и бота, у которого в @BotFather через
// /setdomain указан публичный домен сайта — на localhost виджет не отрисуется.
// См. docs/ARCHITECTURE.md, раздел 3.
export function TelegramLoginButton({ botUsername }: { botUsername: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    (window as unknown as { onTelegramAuth: (user: TelegramAuthPayload) => void }).onTelegramAuth = (user) => {
      void signIn("telegram", { payload: JSON.stringify(user), redirectTo: "/account" });
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);

    return () => {
      container.replaceChildren();
    };
  }, [botUsername]);

  return <div ref={containerRef} />;
}
