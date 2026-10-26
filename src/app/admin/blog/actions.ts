"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";

export type BlogActionState = { error?: string } | undefined;

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

export async function createBlogPostAction(_prev: BlogActionState, formData: FormData): Promise<BlogActionState> {
  const actor = await requireManager();
  const title = String(formData.get("title") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const isPublished = formData.get("isPublished") === "on";

  if (!title || !excerpt || !content) return { error: "Заполните все поля" };

  const post = await prisma.blogPost.create({
    data: {
      slug: `${slugify(title)}-${Date.now().toString(36)}`,
      title,
      excerpt,
      content,
      authorId: actor.id,
      isPublished,
      publishedAt: isPublished ? new Date() : null,
    },
  });

  redirect(`/admin/blog/${post.id}`);
}

export async function updateBlogPostAction(_prev: BlogActionState, formData: FormData): Promise<BlogActionState> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const isPublished = formData.get("isPublished") === "on";

  if (!id || !title || !excerpt || !content) return { error: "Заполните все поля" };

  const existing = await prisma.blogPost.findUnique({ where: { id } });
  await prisma.blogPost.update({
    where: { id },
    data: {
      title,
      excerpt,
      content,
      isPublished,
      publishedAt: isPublished && !existing?.publishedAt ? new Date() : existing?.publishedAt,
    },
  });

  revalidatePath(`/admin/blog/${id}`);
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  return undefined;
}
