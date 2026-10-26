import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { BlogForm } from "../blog-form";

export const dynamic = "force-dynamic";

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  const post = await prisma.blogPost.findUnique({ where: { id } });
  if (!post) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold">{post.title}</h1>
      <div className="mt-6">
        <BlogForm post={post} />
      </div>
    </div>
  );
}
