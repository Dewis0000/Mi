import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";

// Экспорт персональных данных по запросу пользователя (152-ФЗ) — docs/ARCHITECTURE.md, раздел 13.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      bookings: { include: { slot: { include: { room: true } } } },
      orders: true,
      pointsTransactions: true,
      externalAccounts: true,
      giftCertificates: true,
    },
  });

  if (!user) return NextResponse.json({ error: "Не найден" }, { status: 404 });

  return new NextResponse(JSON.stringify(user, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="user-${id}.json"`,
    },
  });
}
