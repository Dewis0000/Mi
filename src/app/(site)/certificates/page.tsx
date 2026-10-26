import { Gift } from "lucide-react";
import { ContentHeader } from "@/components/layout/content-header";
import { CertificateForm } from "./certificate-form";

export const metadata = { title: "Подарочные сертификаты" };

export default function CertificatesPage() {
  return (
    <div className="mx-auto max-w-xl px-4 pb-16 sm:px-6">
      <ContentHeader
        title="Подарочный сертификат"
        description="Отличный подарок, когда не знаешь, какой квест выбрать за другого человека"
      />
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <Gift className="size-5 shrink-0 text-primary" />
        <p>
          Сертификат придёт на указанный email сразу после оплаты. Получатель может использовать его
          при посещении квеста — достаточно назвать код администратору на ресепшене.
        </p>
      </div>
      <CertificateForm />
    </div>
  );
}
