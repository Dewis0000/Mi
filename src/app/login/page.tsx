import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Вход",
  description: "Войдите и продолжите свой путь к Залу Позора (или к вершине таблицы).",
};

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-md flex-col items-center justify-center px-4 py-12 sm:px-6">
      <LoginForm />
    </div>
  );
}
