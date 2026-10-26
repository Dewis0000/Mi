"use client";

import { useTransition } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { togglePublishedAction, deleteReviewAction } from "./actions";

export function ReviewRow({
  review,
}: {
  review: { id: string; authorName: string; rating: number; text: string; isPublished: boolean; roomTitle: string | null };
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{review.authorName}</p>
          {review.roomTitle && <p className="text-xs text-muted-foreground">{review.roomTitle}</p>}
        </div>
        <div className="flex items-center gap-1 text-amber-500">
          {Array.from({ length: review.rating }).map((_, i) => (
            <Star key={i} className="size-3.5 fill-current" />
          ))}
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{review.text}</p>
      <div className="mt-3 flex items-center gap-2">
        <Badge variant={review.isPublished ? "default" : "outline"}>{review.isPublished ? "Опубликован" : "Скрыт"}</Badge>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => startTransition(() => togglePublishedAction(review.id, review.isPublished))}
        >
          {review.isPublished ? "Скрыть" : "Опубликовать"}
        </Button>
        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => startTransition(() => deleteReviewAction(review.id))}>
          Удалить
        </Button>
      </div>
    </div>
  );
}
