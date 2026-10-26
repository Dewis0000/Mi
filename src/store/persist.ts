// Обёртки над localStorage/sessionStorage: приватный режим браузера,
// заблокированный доступ к хранилищу или превью без storage не должны
// ронять игру — они просто ведут себя как отсутствие сохранённого значения.

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // недоступно — молча игнорируем, это не критичный путь
  }
}

export function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // недоступно — молча игнорируем
  }
}

export function removeLocal(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export function removeSession(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

// Обфускация ключа ИИ "от случайного взгляда" (раздел 11) — не
// криптографическая защита, просто чтобы ключ не читался напрямую из
// devtools/дампа localStorage глазами. Реальная защита ключа — он никогда
// не покидает браузер и не уходит никуда, кроме выбранного провайдера.
export function obfuscate(value: string): string {
  return btoa(encodeURIComponent(value).split('').reverse().join(''));
}

export function deobfuscate(value: string): string {
  try {
    return decodeURIComponent(atob(value).split('').reverse().join(''));
  } catch {
    return '';
  }
}
