"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { generateSlotsForRoom, BookingError } from "@/lib/booking";
import type { RoomGenre, RoomDifficulty, RoomStatus } from "../../../../generated/enums";

export type RoomActionState = { error?: string; success?: string } | undefined;

function slugify(input: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return input
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseRoomForm(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    genre: formData.get("genre") as RoomGenre,
    difficulty: formData.get("difficulty") as RoomDifficulty,
    minPlayers: Number(formData.get("minPlayers")),
    maxPlayers: Number(formData.get("maxPlayers")),
    durationMinutes: Number(formData.get("durationMinutes")),
    cleanupMinutes: Number(formData.get("cleanupMinutes")),
    basePrice: Number(formData.get("basePrice")),
    extraPlayerPrice: Number(formData.get("extraPlayerPrice")),
    ageLimit: Number(formData.get("ageLimit")),
    status: formData.get("status") as RoomStatus,
    locationId: String(formData.get("locationId") ?? ""),
  };
}

export async function createRoomAction(_prev: RoomActionState, formData: FormData): Promise<RoomActionState> {
  await requireManager();
  const data = parseRoomForm(formData);
  if (!data.title || !data.locationId) return { error: "Заполните название и локацию" };

  const slug = slugify(data.title) || `quest-${Date.now()}`;
  const room = await prisma.room.create({ data: { ...data, slug } });

  for (let weekday = 0; weekday <= 6; weekday++) {
    await prisma.scheduleTemplate.create({
      data: { roomId: room.id, weekday, startTime: "11:00", endTime: "23:00" },
    });
  }

  redirect(`/admin/rooms/${room.id}`);
}

export async function updateRoomAction(_prev: RoomActionState, formData: FormData): Promise<RoomActionState> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const data = parseRoomForm(formData);
  if (!id || !data.title || !data.locationId) return { error: "Заполните название и локацию" };

  await prisma.room.update({ where: { id }, data });
  revalidatePath(`/admin/rooms/${id}`);
  revalidatePath("/admin/rooms");
  return { success: "Сохранено" };
}

export async function generateSlotsAction(roomId: string) {
  await requireManager();
  try {
    const created = await generateSlotsForRoom(roomId, 14);
    revalidatePath(`/admin/rooms/${roomId}`);
    return { success: `Создано слотов: ${created}` };
  } catch (error) {
    if (error instanceof BookingError) return { error: error.message };
    throw error;
  }
}
