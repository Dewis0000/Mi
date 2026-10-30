import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Регистрация",
  description: "Создайте профиль и начните выпендриваться на законных основаниях.",
};

export default function RegisterPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-md flex-col items-center justify-center px-4 py-12 sm:px-6">
      <RegisterForm />
    </div>
  );
}
