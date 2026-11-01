import { create } from 'zustand';
import { THEMES, VALUES, DEMO_PLAYERS, MEDALS } from './texts.js';

// Ступени бюста по счёту. Ступени копятся: каждая добавляет украшение, парик скрывает венок.
export function tierOf(score) {
  return {
    wreath: score >= 0,
    epaulettes: score >= 1000,
    monocle: score >= 2000,
    wig: score >= 3000,
    cloak: score >= 4000,
    halo: score >= 5000,
    minus: score < 0,
    deepMinus: score <= -1000,
  };
}

export function fmtScore(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const tiles = THEMES.flatMap((theme, col) => VALUES.map((value, row) => ({
  id: `${col}-${row}`, col, row, theme, value, used: false,
})));

export const useGame = create((set, get) => ({
  players: DEMO_PLAYERS.map((p, i) => ({ id: i, ...p, streak: 0, jumpSeq: 0 })),
  active: 0,
  tiles,
  picked: null, // плитка, на которую выпало отвечать
  pickedAt: 0, // когда выбрали: для медали «раньше, чем подумал»
  medal: null, // { id, text, key } — показывается поверх сцены
  // Событие для визуальных эффектов: сцена подписывается и реагирует, логика счёта её не знает
  event: { kind: 'none', seq: 0, playerId: -1, value: 0 },

  setActive(id) {
    set({ active: id });
  },

  // Выбор плитки. Возвращает false, если плитка уже открыта или выбор занят
  pickTile(id) {
    const { tiles: list, picked } = get();
    const tile = list.find((t) => t.id === id);
    if (!tile || tile.used || picked) return false;
    set({ picked: tile, pickedAt: performance.now(), event: { kind: 'pick', seq: get().event.seq + 1, playerId: get().active, value: tile.value } });
    return true;
  },

  // Помечаем плитку открытой после анимации
  markUsed(id) {
    set({ tiles: get().tiles.map((t) => (t.id === id ? { ...t, used: true } : t)) });
  },

  // Ответ: верно — начисляем номинал, неверно — списываем. Счёт, серия минусов и медали — здесь.
  answer(correct) {
    const s = get();
    const tile = s.picked;
    if (!tile) return null;
    const id = s.active;
    const delta = correct ? tile.value : -tile.value;
    const players = s.players.map((p) => {
      if (p.id !== id) return p;
      const streak = correct ? 0 : p.streak + 1;
      return { ...p, score: p.score + delta, streak, jumpSeq: correct ? p.jumpSeq + 1 : p.jumpSeq };
    });
    const player = players.find((p) => p.id === id);
    let medal = null;
    if (correct && performance.now() - s.pickedAt < 2000) medal = { id: 'fast', text: MEDALS.fast };
    if (!correct && player.streak >= 3) medal = { id: 'streak', text: MEDALS.streak };
    const seq = s.event.seq + 1;
    set({
      players,
      picked: null,
      medal: medal ? { ...medal, seq } : s.medal,
      event: { kind: correct ? 'correct' : 'wrong', seq, playerId: id, value: tile.value },
    });
    return { correct, delta };
  },

  // Медаль закрыта по таймеру или по клику
  dismissMedal() {
    set({ medal: null });
  },

  resetPicked() {
    set({ picked: null });
  },
}));

// Счёт игрока с учётом ступеней: удобно компонентам бюста
export function usePlayer(id) {
  return useGame((s) => s.players.find((p) => p.id === id));
}
