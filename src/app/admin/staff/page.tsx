import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/current-user";
import { StaffForm } from "./staff-form";
import { StaffRow } from "./staff-row";

export const metadata = { title: "Сотрудники" };
export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  await requireAdmin();
  const [staff, locations] = await Promise.all([
    prisma.user.findMany({ where: { role: { not: "CUSTOMER" } }, include: { location: true }, orderBy: { role: "asc" } }),
    prisma.location.findMany({ select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Сотрудники</h1>
      <p className="mt-1 text-muted-foreground">Сотрудник сначала регистрируется как обычный клиент, затем ему назначается роль здесь.</p>

      <div className="mt-6">
        <StaffForm locations={locations} />
      </div>

      <div className="mt-6 space-y-2">
        {staff.map((user) => (
          <StaffRow
            key={user.id}
            user={{ id: user.id, name: user.name, phone: user.phone, role: user.role, locationName: user.location?.name ?? null }}
          />
        ))}
        {staff.length === 0 && <p className="text-muted-foreground">Пока только вы.</p>}
      </div>
    </div>
  );
}
