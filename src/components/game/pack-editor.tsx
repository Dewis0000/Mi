"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { demoPack } from "@/lib/demo-data";

type EditorQuestion = {
  id: string;
  value: number;
  question: string;
  answer: string;
};

type EditorCategory = {
  id: string;
  title: string;
  questions: EditorQuestion[];
};

const seedCategory: EditorCategory = {
  id: "seed-cat",
  title: demoPack.categories[0].title,
  questions: demoPack.categories[0].questions.map((q, i) => ({
    id: `seed-q${i}`,
    ...q,
  })),
};

export function PackEditor() {
  const [packTitle, setPackTitle] = useState("Мой первый пакет позора");
  const [timer, setTimer] = useState("20");
  const [categories, setCategories] = useState<EditorCategory[]>([
    seedCategory,
  ]);
  const nextId = useRef(1000);

  function addCategory() {
    nextId.current += 1;
    setCategories((prev) => [
      ...prev,
      { id: `cat-${nextId.current}`, title: "Новая категория", questions: [] },
    ]);
  }

  function removeCategory(id: string) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  function updateCategory(id: string, title: string) {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
  }

  function addQuestion(catId: string) {
    nextId.current += 1;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? {
              ...c,
              questions: [
                ...c.questions,
                {
                  id: `q-${nextId.current}`,
                  value: (c.questions.length + 1) * 100,
                  question: "",
                  answer: "",
                },
              ],
            }
          : c
      )
    );
  }

  function removeQuestion(catId: string, qId: string) {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? { ...c, questions: c.questions.filter((q) => q.id !== qId) }
          : c
      )
    );
  }

  function updateQuestion(
    catId: string,
    qId: string,
    patch: Partial<EditorQuestion>
  ) {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? {
              ...c,
              questions: c.questions.map((q) =>
                q.id === qId ? { ...q, ...patch } : q
              ),
            }
          : c
      )
    );
  }

  function handleSave() {
    const totalQuestions = categories.reduce(
      (n, c) => n + c.questions.length,
      0
    );
    if (!packTitle.trim()) {
      toast.error("Дайте пакету имя. Даже плохое название — уже название.");
      return;
    }
    if (categories.length === 0 || totalQuestions === 0) {
      toast.error("Нужна хотя бы одна категория с одним вопросом.");
      return;
    }
    toast.success("Пакет сохранён локально 💾", {
      description: "Облачное хранение подключим на следующем этапе.",
    });
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          Создать свой пакет
        </h1>
        <p className="text-sm text-muted-foreground">
          Категории, вопросы, баллы — всё как в настоящей студии. Только без
          гонорара ведущему.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Настройки игры</CardTitle>
          <CardDescription>Это применится ко всей игре.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pack-title">Название пакета</Label>
            <Input
              id="pack-title"
              value={packTitle}
              onChange={(e) => setPackTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Время на ответ</Label>
            <Select
              value={timer}
              onValueChange={(value) => value && setTimer(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 секунд — для смелых</SelectItem>
                <SelectItem value="15">15 секунд</SelectItem>
                <SelectItem value="20">20 секунд — стандарт</SelectItem>
                <SelectItem value="30">30 секунд</SelectItem>
                <SelectItem value="60">60 секунд — для занудов</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {categories.map((category) => (
          <Card key={category.id}>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <Input
                value={category.title}
                onChange={(e) => updateCategory(category.id, e.target.value)}
                className="font-display text-base font-bold"
                placeholder="Название категории"
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Удалить категорию"
                onClick={() => removeCategory(category.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {category.questions.map((q, qi) => (
                <div
                  key={q.id}
                  className="grid gap-2 rounded-xl bg-muted/50 p-3 sm:grid-cols-[4.5rem_1fr_1fr_auto] sm:items-start"
                >
                  <Input
                    type="number"
                    step={100}
                    value={q.value}
                    onChange={(e) =>
                      updateQuestion(category.id, q.id, {
                        value: Number(e.target.value) || 0,
                      })
                    }
                    aria-label={`Баллы за вопрос ${qi + 1}`}
                    className="font-mono"
                  />
                  <Textarea
                    value={q.question}
                    onChange={(e) =>
                      updateQuestion(category.id, q.id, {
                        question: e.target.value,
                      })
                    }
                    placeholder="Текст вопроса"
                    className="min-h-10 resize-none"
                  />
                  <Input
                    value={q.answer}
                    onChange={(e) =>
                      updateQuestion(category.id, q.id, {
                        answer: e.target.value,
                      })
                    }
                    placeholder="Правильный ответ"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Удалить вопрос"
                    onClick={() => removeQuestion(category.id, q.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => addQuestion(category.id)}
              >
                <Plus className="size-4" /> Добавить вопрос
              </Button>
            </CardContent>
          </Card>
        ))}

        <Button variant="outline" onClick={addCategory}>
          <Plus className="size-4" /> Добавить категорию
        </Button>
      </div>

      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" className="glow-primary h-11 px-8" onClick={handleSave}>
          Сохранить пакет
        </Button>
      </div>
    </div>
  );
}
