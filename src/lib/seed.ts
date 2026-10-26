// Генерация свежего сида для новой жизни. Не в src/engine/: это выбор ТОЧКИ
// СТАРТА игроком ("дай мне случайную жизнь"), а не бросок внутри уже
// идущей симуляции — но на всякий случай использует crypto, а не
// Math.random, из общей гигиены.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomSeed(length = 12): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
