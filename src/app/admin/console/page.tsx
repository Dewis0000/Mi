import { requireStaff } from "@/lib/current-user";
import { searchBookingsAction } from "./actions";
import { ConsoleClient } from "./console-client";

export const metadata = { title: "Стойка регистрации" };
export const dynamic = "force-dynamic";

export default async function AdminConsolePage() {
  await requireStaff();
  const initial = await searchBookingsAction("");

  return (
    <div>
      <h1 className="text-2xl font-bold">Стойка регистрации</h1>
      <p className="mt-1 text-muted-foreground">Бронирования на сегодня — отметка прихода, старт и завершение игры</p>
      <div className="mt-6">
        <ConsoleClient initial={initial} />
      </div>
    </div>
  );
}
