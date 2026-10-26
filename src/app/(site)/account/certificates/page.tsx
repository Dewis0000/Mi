import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { formatPrice } from "@/lib/room-labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Сертификаты" };
export const dynamic = "force-dynamic";

export default async function AccountCertificatesPage() {
  const user = await requireUser();
  const certificates = await prisma.giftCertificate.findMany({
    where: { ownerId: user.id },
    include: { order: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Сертификаты</h1>
        <Button variant="outline" render={<Link href="/certificates" />}>
          Купить сертификат
        </Button>
      </div>

      <div className="mt-6 space-y-3">
        {certificates.map((cert) => (
          <div key={cert.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
            <div>
              <p className="font-mono font-medium">{cert.code}</p>
              <p className="text-sm text-muted-foreground">
                Баланс: {formatPrice(cert.balance)} из {formatPrice(cert.amount)}
                {cert.recipientName && ` · для ${cert.recipientName}`}
              </p>
            </div>
            <Badge variant={cert.order?.status === "PAID" ? "default" : "outline"}>
              {cert.order?.status === "PAID" ? "Оплачен" : "Ожидает оплаты"}
            </Badge>
          </div>
        ))}
        {certificates.length === 0 && <p className="text-muted-foreground">У вас пока нет сертификатов.</p>}
      </div>
    </div>
  );
}
