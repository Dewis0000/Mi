import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug } });
  return { title: post?.title ?? "Статья" };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug }, include: { author: true } });
  if (!post || !post.isPublished) notFound();

  return (
    <article className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Назад к блогу
      </Link>
      <h1 className="mt-4 text-3xl font-bold">{post.title}</h1>
      {post.publishedAt && (
        <p className="mt-2 text-sm text-muted-foreground">
          {post.publishedAt.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })}
          {post.author && ` · ${post.author.name}`}
        </p>
      )}
      <div className="mt-6 aspect-[16/9] rounded-xl bg-gradient-to-br from-primary/20 via-primary/5 to-muted" />
      <div className="mt-6 space-y-4 leading-relaxed text-foreground/90">
        {post.content.split("\n\n").map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </article>
  );
}
