import Link from "next/link";
import { Radio } from "lucide-react";
import { prisma } from "@/lib/db";

// Безопасный тизер без реального видео — см. docs/ARCHITECTURE.md, раздел 7.
// Показывает только количество активных сессий, не выдавая, кто именно играет.
export async function LiveNowBadge() {
  const count = await prisma.liveSession.count({ where: { status: "LIVE" } });
  if (count === 0) return null;

  return (
    <Link
      href="/quests"
      className="inline-flex items-center gap-1.5 rounded-full border border-live/30 bg-live/10 px-3 py-1 text-xs font-medium text-live transition-colors hover:bg-live/20"
    >
      <Radio className="size-3.5" />
      Сейчас играют: {count}
    </Link>
  );
}
