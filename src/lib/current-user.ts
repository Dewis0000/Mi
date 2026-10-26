import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { UserRole } from "../../generated/enums";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");

  return user;
}

export async function requireRole(allowed: UserRole[]) {
  const user = await requireUser();
  if (!allowed.includes(user.role)) redirect("/admin");
  return user;
}

export const requireStaff = () => requireRole(["ADMIN", "MANAGER", "ACTOR"]);
export const requireAdmin = () => requireRole(["ADMIN"]);
export const requireManager = () => requireRole(["ADMIN", "MANAGER"]);
