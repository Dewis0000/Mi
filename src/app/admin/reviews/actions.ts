"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";

export async function togglePublishedAction(id: string, isPublished: boolean) {
  await requireManager();
  await prisma.review.update({ where: { id }, data: { isPublished: !isPublished } });
  revalidatePath("/admin/reviews");
  revalidatePath("/reviews");
}

export async function deleteReviewAction(id: string) {
  await requireManager();
  await prisma.review.delete({ where: { id } });
  revalidatePath("/admin/reviews");
  revalidatePath("/reviews");
}
