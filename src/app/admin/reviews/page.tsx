import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/current-user";
import { ReviewRow } from "./review-row";

export const metadata = { title: "Отзывы" };
export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
  await requireManager();
  const reviews = await prisma.review.findMany({ include: { room: true }, orderBy: { createdAt: "desc" } });

  return (
    <div>
      <h1 className="text-2xl font-bold">Отзывы</h1>
      <div className="mt-6 space-y-3">
        {reviews.map((review) => (
          <ReviewRow
            key={review.id}
            review={{
              id: review.id,
              authorName: review.authorName,
              rating: review.rating,
              text: review.text,
              isPublished: review.isPublished,
              roomTitle: review.room?.title ?? null,
            }}
          />
        ))}
        {reviews.length === 0 && <p className="text-muted-foreground">Отзывов пока нет.</p>}
      </div>
    </div>
  );
}
