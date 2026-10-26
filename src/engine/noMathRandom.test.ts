import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE_DIR = join(__dirname);

function listTsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(dir, f));
}

describe('критерий приёмки: ни одного Math.random() в engine/', () => {
  it('не содержит Math.random в каталоге engine/', () => {
    const offenders: string[] = [];
    for (const file of listTsFiles(ENGINE_DIR)) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('Math.random')) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
