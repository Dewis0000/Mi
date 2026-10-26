"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";

export type LocationActionState = { error?: string; success?: string } | undefined;

function parseLocationForm(formData: FormData) {
  const lat = String(formData.get("lat") ?? "").trim();
  const lng = String(formData.get("lng") ?? "").trim();
  return {
    name: String(formData.get("name") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    lat: lat ? Number(lat) : undefined,
    lng: lng ? Number(lng) : undefined,
  };
}

export async function createLocationAction(_prev: LocationActionState, formData: FormData): Promise<LocationActionState> {
  await requireManager();
  const data = parseLocationForm(formData);
  if (!data.name || !data.city || !data.address) return { error: "Заполните название, город и адрес" };

  const location = await prisma.location.create({ data });
  redirect(`/admin/locations/${location.id}`);
}

export async function updateLocationAction(_prev: LocationActionState, formData: FormData): Promise<LocationActionState> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const data = parseLocationForm(formData);
  if (!id || !data.name || !data.city || !data.address) return { error: "Заполните название, город и адрес" };

  await prisma.location.update({ where: { id }, data });
  revalidatePath(`/admin/locations/${id}`);
  revalidatePath("/admin/locations");
  revalidatePath("/about");
  revalidatePath("/contacts");
  return { success: "Сохранено" };
}
