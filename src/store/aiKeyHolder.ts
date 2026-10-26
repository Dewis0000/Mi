// Ключ ИИ живёт только в памяти этого модуля и в localStorage/sessionStorage
// браузера — никогда в самом Zustand-сторе (чтобы не могли случайно попасть
// в экспорт журнала или дамп состояния) и никогда никуда за пределы прямого
// запроса к выбранному провайдеру (раздел 11, принцип 3).
import { deobfuscate, obfuscate, readLocal, readSession, removeLocal, removeSession, writeLocal, writeSession } from './persist';

const LOCAL_KEY = 'oob.ai.key';
const SESSION_KEY = 'oob.ai.key.session';
const BASE_URL_KEY = 'oob.ai.baseUrl';

let inMemoryKey: string | null = null;

export function loadPersistedKey(): string | null {
  const fromLocal = readLocal<string | null>(LOCAL_KEY, null);
  if (fromLocal) {
    inMemoryKey = deobfuscate(fromLocal);
    return inMemoryKey;
  }
  const fromSession = readSession<string | null>(SESSION_KEY, null);
  if (fromSession) {
    inMemoryKey = deobfuscate(fromSession);
    return inMemoryKey;
  }
  return null;
}

export function getKey(): string | null {
  return inMemoryKey;
}

export function setKey(key: string, remember: boolean): void {
  inMemoryKey = key;
  const obf = obfuscate(key);
  if (remember) {
    writeLocal(LOCAL_KEY, obf);
    removeSession(SESSION_KEY);
  } else {
    writeSession(SESSION_KEY, obf);
    removeLocal(LOCAL_KEY);
  }
}

export function clearKey(): void {
  inMemoryKey = null;
  removeLocal(LOCAL_KEY);
  removeSession(SESSION_KEY);
}

export function getBaseUrl(): string {
  return readLocal<string>(BASE_URL_KEY, '');
}

export function setBaseUrl(url: string): void {
  writeLocal(BASE_URL_KEY, url);
}
