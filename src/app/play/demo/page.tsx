import type { Metadata } from "next";
import { DemoPlayClient } from "@/components/game/demo-play-client";

export const metadata: Metadata = {
  title: "Играть демо",
  description: "Демо-пакет «Выпендрёж 101» — попробуйте игровое поле, кнопку и судейство прямо в браузере.",
};

export default function PlayDemoPage() {
  return <DemoPlayClient />;
}
