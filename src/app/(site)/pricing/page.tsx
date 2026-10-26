import Link from "next/link";
import { prisma } from "@/lib/db";
import { ContentHeader } from "@/components/layout/content-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { GENRE_LABELS, formatPlayers, formatPrice } from "@/lib/room-labels";

export const metadata = { title: "Цены" };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const rooms = await prisma.room.findMany({ where: { status: "ACTIVE" }, orderBy: { basePrice: "asc" } });

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
      <ContentHeader
        title="Цены"
        description="Базовая цена — за минимальный состав команды. Чем больше игроков, тем дешевле на человека."
      />

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Квест</TableHead>
              <TableHead>Жанр</TableHead>
              <TableHead>Игроков</TableHead>
              <TableHead className="text-right">Базовая цена</TableHead>
              <TableHead className="text-right">За доп. игрока</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rooms.map((room) => (
              <TableRow key={room.id}>
                <TableCell>
                  <Link href={`/quests/${room.slug}`} className="font-medium hover:text-primary">
                    {room.title}
                  </Link>
                </TableCell>
                <TableCell>{GENRE_LABELS[room.genre]}</TableCell>
                <TableCell>{formatPlayers(room.minPlayers, room.maxPlayers)}</TableCell>
                <TableCell className="text-right">{formatPrice(room.basePrice)}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {room.extraPlayerPrice > 0 ? `+${formatPrice(room.extraPlayerPrice)}` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border p-5">
          <h2 className="font-semibold">Будни и выходные</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Цены в таблице — для будних дней. По пятницам, субботам и воскресеньям, а также в праздники
            действует вечерний тариф — уточняйте при бронировании конкретного времени на странице квеста.
          </p>
        </div>
        <div className="rounded-xl border p-5">
          <h2 className="font-semibold">Скидки</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Баллы за посещения можно использовать для оплаты до 50% стоимости брони — подробнее в{" "}
            <Link href="/loyalty" className="underline underline-offset-4">
              программе лояльности
            </Link>
            . Для компаний от 10 человек и мероприятий — индивидуальные условия на странице{" "}
            <Link href="/business" className="underline underline-offset-4">
              «Для бизнеса»
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Button size="lg" render={<Link href="/quests" />}>
          Выбрать квест и забронировать
        </Button>
      </div>
    </div>
  );
}
