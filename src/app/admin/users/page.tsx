import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export const metadata = { title: "Пользователи" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireManager();
  const { q } = await searchParams;
  const query = q?.trim();

  const users = await prisma.user.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query } },
            { phone: { contains: query } },
            { email: { contains: query } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Пользователи</h1>

      <form className="mt-4">
        <Input name="q" defaultValue={query} placeholder="Поиск по имени, телефону, email…" />
      </form>

      <div className="mt-6 space-y-2">
        {users.map((user) => (
          <Link
            key={user.id}
            href={`/admin/users/${user.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border p-4 hover:bg-accent"
          >
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-muted-foreground">
                {user.phone} {user.email ? `· ${user.email}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{user.pointsBalance} баллов</Badge>
              <Badge variant={user.role === "CUSTOMER" ? "secondary" : "default"}>{user.role}</Badge>
            </div>
          </Link>
        ))}
        {users.length === 0 && <p className="text-muted-foreground">Никого не найдено.</p>}
      </div>
    </div>
  );
}
