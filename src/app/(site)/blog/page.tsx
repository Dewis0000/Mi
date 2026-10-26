import Link from "next/link";
import { prisma } from "@/lib/db";
import { ContentHeader } from "@/components/layout/content-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Блог" };
export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const posts = await prisma.blogPost.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
      <ContentHeader title="Блог" description="Советы перед игрой, новости и истории из закулисья квестов" />

      <div className="grid gap-6 sm:grid-cols-2">
        {posts.map((post) => (
          <Link key={post.id} href={`/blog/${post.slug}`}>
            <Card className="h-full transition-shadow hover:shadow-lg">
              <div className="aspect-[16/9] rounded-t-xl bg-gradient-to-br from-primary/20 via-primary/5 to-muted" />
              <CardContent className="pt-4">
                <h2 className="font-heading text-lg font-semibold">{post.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{post.excerpt}</p>
                {post.publishedAt && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {post.publishedAt.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
        {posts.length === 0 && <p className="text-muted-foreground">Публикаций пока нет.</p>}
      </div>
    </div>
  );
}
