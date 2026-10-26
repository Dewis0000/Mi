import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Блог" };
export const dynamic = "force-dynamic";

export default async function AdminBlogPage() {
  await requireManager();
  const posts = await prisma.blogPost.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Блог</h1>
        <Button render={<Link href="/admin/blog/new" />}>
          <Plus className="size-4" /> Новая статья
        </Button>
      </div>
      <div className="mt-6 space-y-2">
        {posts.map((post) => (
          <Link key={post.id} href={`/admin/blog/${post.id}`} className="flex items-center justify-between gap-3 rounded-lg border p-4 hover:bg-accent">
            <p className="font-medium">{post.title}</p>
            <Badge variant={post.isPublished ? "default" : "outline"}>{post.isPublished ? "Опубликована" : "Черновик"}</Badge>
          </Link>
        ))}
        {posts.length === 0 && <p className="text-muted-foreground">Статей пока нет.</p>}
      </div>
    </div>
  );
}
