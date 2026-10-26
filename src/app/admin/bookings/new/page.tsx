import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { ManualBookingForm } from "./manual-booking-form";

export const metadata = { title: "Новое бронирование" };
export const dynamic = "force-dynamic";

export default async function NewBookingPage() {
  await requireManager();
  const rooms = await prisma.room.findMany({ where: { status: "ACTIVE" }, select: { id: true, title: true } });

  return (
    <div>
      <h1 className="text-2xl font-bold">Бронирование вручную</h1>
      <p className="mt-1 text-muted-foreground">Для звонков и бронирований на ресепшене — оплата собирается вне системы</p>
      <div className="mt-6">
        <ManualBookingForm rooms={rooms} />
      </div>
    </div>
  );
}
