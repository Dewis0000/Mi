import Link from "next/link";
import { Compass, Mail, MapPin, Phone } from "lucide-react";
import { siteConfig, footerNav } from "@/lib/site-config";

export function Footer() {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-5 lg:px-8">
        <div className="space-y-3 lg:col-span-2">
          <Link href="/" className="flex items-center gap-2 font-heading text-lg font-bold">
            <Compass className="size-6 text-primary" />
            {siteConfig.name}
          </Link>
          <p className="max-w-sm text-sm text-muted-foreground">
            {siteConfig.description}
          </p>
          <div className="space-y-1.5 pt-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0" /> {siteConfig.address}
            </p>
            <p className="flex items-center gap-2">
              <Phone className="size-4 shrink-0" />
              <a href={`tel:${siteConfig.phone.replace(/[^+\d]/g, "")}`} className="hover:text-foreground">
                {siteConfig.phone}
              </a>
            </p>
            <p className="flex items-center gap-2">
              <Mail className="size-4 shrink-0" />
              <a href={`mailto:${siteConfig.email}`} className="hover:text-foreground">
                {siteConfig.email}
              </a>
            </p>
          </div>
        </div>

        <FooterColumn title="Клуб" items={footerNav.club} />
        <FooterColumn title="Информация" items={footerNav.company} />
        <FooterColumn title="Документы" items={footerNav.legal} />
      </div>

      <div className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} {siteConfig.fullName}. Все права защищены.
          </p>
          <p>{siteConfig.legalEntity}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  items,
}: {
  title: string;
  items: ReadonlyArray<{ title: string; href: string }>;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
