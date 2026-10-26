import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { prisma } from "@/lib/db";
import { ContentHeader } from "@/components/layout/content-header";
import { siteConfig } from "@/lib/site-config";

export const metadata = { title: "Контакты" };
export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const locations = await prisma.location.findMany();

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
      <ContentHeader title="Контакты" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border p-5">
          <Phone className="size-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium">Телефон</p>
            <a href={`tel:${siteConfig.phone.replace(/[^+\d]/g, "")}`} className="text-sm text-muted-foreground hover:text-foreground">
              {siteConfig.phone}
            </a>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl border p-5">
          <Mail className="size-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium">Email</p>
            <a href={`mailto:${siteConfig.email}`} className="text-sm text-muted-foreground hover:text-foreground">
              {siteConfig.email}
            </a>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl border p-5">
          <Clock className="size-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium">Время работы</p>
            <p className="text-sm text-muted-foreground">{siteConfig.workingHours}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl border p-5">
          <MapPin className="size-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium">Адрес</p>
            <p className="text-sm text-muted-foreground">{siteConfig.address}</p>
          </div>
        </div>
      </div>

      {locations.length > 0 && (
        <div className="mt-6 space-y-3">
          {locations.map((loc) => (
            <div key={loc.id} className="rounded-xl border p-5">
              <p className="font-medium">{loc.name}</p>
              <p className="text-sm text-muted-foreground">
                {loc.city}, {loc.address}
              </p>
              {loc.phone && <p className="text-sm text-muted-foreground">{loc.phone}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex gap-4 text-sm">
        <a href={siteConfig.social.vk} className="text-muted-foreground hover:text-foreground">
          VK
        </a>
        <a href={siteConfig.social.telegram} className="text-muted-foreground hover:text-foreground">
          Telegram
        </a>
      </div>
    </div>
  );
}
