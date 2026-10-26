import { ShieldCheck, Sparkles, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { ContentHeader } from "@/components/layout/content-header";
import { siteConfig } from "@/lib/site-config";

export const metadata = { title: "О клубе" };
export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const locations = await prisma.location.findMany();

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
      <ContentHeader
        title={`О клубе «${siteConfig.name}»`}
        description="Делаем квесты в реальности с 2021 года — живые декорации, актёры и внимание к деталям"
      />

      <div className="space-y-6 leading-relaxed text-foreground/90">
        <p>
          «{siteConfig.name}» — сеть квестов в реальности. Мы строим декорации в полный рост, приглашаем
          актёров для живых ролей и постоянно обновляем сценарии, чтобы каждая игра была неожиданной даже
          для тех, кто уже проходил квесты у нас.
        </p>
        <p>
          Команда клуба — геймдизайнеры, декораторы и аниматоры, которым самим нравится пугать и удивлять
          гостей. Мы тестируем каждый квест десятками прогонов, прежде чем открыть его для посетителей.
        </p>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        <div className="rounded-xl border p-5 text-center">
          <Sparkles className="mx-auto size-7 text-primary" />
          <h3 className="mt-3 font-semibold">Живые декорации</h3>
          <p className="mt-1 text-sm text-muted-foreground">Полноразмерные комнаты, а не картонные стены</p>
        </div>
        <div className="rounded-xl border p-5 text-center">
          <Users className="mx-auto size-7 text-primary" />
          <h3 className="mt-3 font-semibold">Актёры в кадре</h3>
          <p className="mt-1 text-sm text-muted-foreground">В части квестов есть живой персонаж</p>
        </div>
        <div className="rounded-xl border p-5 text-center">
          <ShieldCheck className="mx-auto size-7 text-primary" />
          <h3 className="mt-3 font-semibold">Безопасность</h3>
          <p className="mt-1 text-sm text-muted-foreground">Инструктаж перед игрой и кнопка выхода в каждой комнате</p>
        </div>
      </div>

      {locations.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-semibold">Наши локации</h2>
          <ul className="mt-4 space-y-2">
            {locations.map((loc) => (
              <li key={loc.id} className="rounded-lg border p-4">
                <p className="font-medium">{loc.name}</p>
                <p className="text-sm text-muted-foreground">
                  {loc.city}, {loc.address}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
