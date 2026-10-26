import type { RoomDifficulty, RoomGenre } from "../../generated/enums";

export const GENRE_LABELS: Record<RoomGenre, string> = {
  HORROR: "Хоррор",
  DETECTIVE: "Детектив",
  SCIFI: "Sci-Fi",
  FAMILY: "Семейный",
  ADVENTURE: "Приключения",
  THRILLER: "Триллер",
};

export const DIFFICULTY_LABELS: Record<RoomDifficulty, string> = {
  EASY: "Легко",
  MEDIUM: "Средне",
  HARD: "Сложно",
};

export function formatPrice(amount: number) {
  return `${amount.toLocaleString("ru-RU")} ₽`;
}

export function formatPlayers(min: number, max: number) {
  return min === max ? `${min} игроков` : `${min}–${max} игроков`;
}
