// Журнал прожитых жизней в IndexedDB через Dexie (раздел 15).
import Dexie, { type EntityTable } from 'dexie';
import type { LifeLogEntry } from '../types';

class JournalDb extends Dexie {
  lives!: EntityTable<LifeLogEntry, 'id'>;

  constructor() {
    super('oob-journal');
    this.version(1).stores({
      lives: '++id, seed, countryIso3, createdAt',
    });
  }
}

export const journalDb = new JournalDb();

export async function addLifeLogEntry(entry: Omit<LifeLogEntry, 'id'>): Promise<number> {
  const id = await journalDb.lives.add(entry as LifeLogEntry);
  return id as number;
}

export async function listLifeLogEntries(): Promise<LifeLogEntry[]> {
  return journalDb.lives.orderBy('createdAt').reverse().toArray();
}

export async function clearJournal(): Promise<void> {
  await journalDb.lives.clear();
}

export async function exportJournal(): Promise<string> {
  const lives = await listLifeLogEntries();
  return JSON.stringify({ version: 1, exportedAt: Date.now(), lives }, null, 2);
}

export interface ImportResult {
  imported: number;
}

export async function importJournal(json: string): Promise<ImportResult> {
  const parsed = JSON.parse(json) as { lives?: Array<Omit<LifeLogEntry, 'id'>> };
  const lives = parsed.lives ?? [];
  for (const life of lives) {
    const { id: _ignored, ...rest } = life as LifeLogEntry;
    await journalDb.lives.add(rest as LifeLogEntry);
  }
  return { imported: lives.length };
}
