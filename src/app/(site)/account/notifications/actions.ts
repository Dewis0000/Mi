"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";

export async function updateNotificationPrefsAction(formData: FormData) {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      notifyBySms: formData.get("notifyBySms") === "on",
      notifyByEmail: formData.get("notifyByEmail") === "on",
      notifyByTelegram: formData.get("notifyByTelegram") === "on",
    },
  });
  revalidatePath("/account/notifications");
}
