import { requireManager } from "@/lib/current-user";
import { LocationForm } from "../location-form";

export const metadata = { title: "Новая локация" };
export const dynamic = "force-dynamic";

export default async function NewLocationPage() {
  await requireManager();
  return (
    <div>
      <h1 className="text-2xl font-bold">Новая локация</h1>
      <div className="mt-6">
        <LocationForm />
      </div>
    </div>
  );
}
