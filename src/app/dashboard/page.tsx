import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JoinByCode } from "@/components/join-by-code";
import { demoPack } from "@/lib/demo-data";

const draftPacks = [
  {
    title: "Корпоративный позор",
    description: "Вопросы про опенспейс, дедлайны и кофемашину, которая всех предала.",
    categories: 3,
    questions: 15,
  },
  {
    title: "Вечер пятницы",
    description: "Для компании, где все уверены, что знают кино лучше остальных.",
    categories: 4,
    questions: 20,
  },
];

export const metadata: Metadata = {
  title: "Мои игры",
  description: "Ваши пакеты вопросов и вход в комнату по коду.",
};

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          Привет, выпендрёжник 🦚
        </h1>
        <p className="text-sm text-muted-foreground">
          Играй свои пакеты, заходи к друзьям по коду или собери что-то новое.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Войти в комнату по коду</CardTitle>
          <CardDescription>
            Друг создал игру и прислал код? Вводите прямо сюда.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <JoinByCode />
        </CardContent>
      </Card>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Мои пакеты</h2>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/create" />}>
            <Plus className="size-4" /> Новый пакет
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{demoPack.title}</CardTitle>
                <Badge className="bg-success/15 text-success">Готов</Badge>
              </div>
              <CardDescription>
                {demoPack.categories.length} категорий ·{" "}
                {demoPack.categories.reduce((n, c) => n + c.questions.length, 0)}{" "}
                вопросов
              </CardDescription>
            </CardHeader>
            <CardFooter className="gap-2">
              <Button size="sm" className="flex-1" nativeButton={false} render={<Link href="/play/demo" />}>
                Играть
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                nativeButton={false}
                render={<Link href="/create" />}
              >
                Редактировать
              </Button>
            </CardFooter>
          </Card>

          {draftPacks.map((pack) => (
            <Card key={pack.title}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{pack.title}</CardTitle>
                  <Badge variant="outline" className="text-muted-foreground">
                    Черновик
                  </Badge>
                </div>
                <CardDescription>
                  {pack.categories} категории · {pack.questions} вопросов
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  nativeButton={false}
                  render={<Link href="/create" />}
                >
                  Продолжить редактирование
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
