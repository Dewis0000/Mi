import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Локации" };
export const dynamic = "force-dynamic";

export default async function AdminLocationsPage() {
  await requireManager();
  const locations = await prisma.location.findMany({ include: { _count: { select: { rooms: true } } }, orderBy: { createdAt: "asc" } });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Локации</h1>
        <Button render={<Link href="/admin/locations/new" />}>
          <Plus className="size-4" /> Новая локация
        </Button>
      </div>
      <p className="mt-1 text-muted-foreground">Адреса клубов — используются на сайте (контакты, о клубе) и при создании квестов.</p>

      <div className="mt-6 space-y-2">
        {locations.map((loc) => (
          <Link key={loc.id} href={`/admin/locations/${loc.id}`} className="flex items-center justify-between gap-3 rounded-lg border p-4 hover:bg-accent">
            <div>
              <p className="font-medium">{loc.name}</p>
              <p className="text-sm text-muted-foreground">
                {loc.city}, {loc.address}
              </p>
            </div>
            <span className="text-sm text-muted-foreground">квестов: {loc._count.rooms}</span>
          </Link>
        ))}
        {locations.length === 0 && <p className="text-muted-foreground">Локаций пока нет — добавьте первую.</p>}
      </div>
    </div>
  );
}
