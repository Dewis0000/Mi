import { Cake, Briefcase, PartyPopper } from "lucide-react";
import { ContentHeader } from "@/components/layout/content-header";
import { siteConfig } from "@/lib/site-config";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Для бизнеса и праздников" };

const cases = [
  {
    icon: Briefcase,
    title: "Корпоративы и тимбилдинг",
    text: "Квест отлично работает как нестандартный тимбилдинг: команда учится договариваться и слушать друг друга под давлением времени. Берём группы от 10 человек — разбиваем на несколько команд и считаем общий рейтинг.",
  },
  {
    icon: Cake,
    title: "Дни рождения",
    text: "Квест как альтернатива привычному празднику: сначала игра, потом — чаепитие в нашей зоне отдыха. Для детских праздников подбираем квесты с лёгкой сложностью и без резких пугающих моментов.",
  },
  {
    icon: PartyPopper,
    title: "Выпускные и встречи выпускников",
    text: "Можем забронировать сразу несколько комнат на весь вечер и устроить турнир между командами с общим призом.",
  },
];

export default function BusinessPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
      <ContentHeader
        title="Для бизнеса и праздников"
        description="Подберём формат под любое мероприятие — от камерной компании друзей до корпоратива на 50 человек"
      />

      <div className="grid gap-6 sm:grid-cols-3">
        {cases.map((item) => (
          <div key={item.title} className="rounded-xl border p-5">
            <item.icon className="size-7 text-primary" />
            <h3 className="mt-3 font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{item.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-xl border bg-card p-6 text-center">
        <h2 className="text-xl font-semibold">Оставьте заявку</h2>
        <p className="mt-2 text-muted-foreground">
          Напишите нам, сколько человек и когда — подберём квесты, время и посчитаем стоимость с учётом
          группового формата.
        </p>
        <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Button size="lg" render={<a href={`tel:${siteConfig.phone.replace(/[^+\d]/g, "")}`} />}>
            Позвонить: {siteConfig.phone}
          </Button>
          <Button size="lg" variant="outline" render={<a href={`mailto:${siteConfig.email}`} />}>
            Написать на {siteConfig.email}
          </Button>
        </div>
      </div>
    </div>
  );
}
