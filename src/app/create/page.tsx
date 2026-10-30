import type { Metadata } from "next";
import { PackEditor } from "@/components/game/pack-editor";

export const metadata: Metadata = {
  title: "Создать пакет",
  description: "Соберите категории и вопросы для своей игры за пару минут.",
};

export default function CreatePage() {
  return <PackEditor />;
}
