import { Star } from "lucide-react";
import { prisma } from "@/lib/db";
import { ContentHeader } from "@/components/layout/content-header";

export const metadata = { title: "Отзывы" };
export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const reviews = await prisma.review.findMany({
    where: { isPublished: true },
    orderBy: { createdAt: "desc" },
    include: { room: true },
    take: 60,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
      <ContentHeader title="Отзывы" description={`${reviews.length} отзывов от игроков, которые прошли наши квесты`} />

      <div className="space-y-4">
        {reviews.map((review) => (
          <div key={review.id} className="rounded-lg border p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{review.authorName}</p>
                {review.room && <p className="text-xs text-muted-foreground">{review.room.title}</p>}
              </div>
              <div className="flex items-center gap-1 text-amber-500">
                {Array.from({ length: review.rating }).map((_, i) => (
                  <Star key={i} className="size-4 fill-current" />
                ))}
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{review.text}</p>
          </div>
        ))}
        {reviews.length === 0 && <p className="text-center text-muted-foreground">Отзывов пока нет.</p>}
      </div>
    </div>
  );
}
