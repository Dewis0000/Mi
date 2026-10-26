import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { LocationForm } from "../location-form";

export const dynamic = "force-dynamic";

export default async function EditLocationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  const location = await prisma.location.findUnique({ where: { id } });
  if (!location) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold">{location.name}</h1>
      <div className="mt-6">
        <LocationForm location={location} />
      </div>
    </div>
  );
}
