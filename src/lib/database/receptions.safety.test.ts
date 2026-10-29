import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as receptionsModule from '@/lib/database/receptions';

describe('receptions client safety (Phase 0)', () => {
  it('no exporta clearAllReceptions ni borrado masivo equivalente', () => {
    expect('clearAllReceptions' in receptionsModule).toBe(false);
    expect(Object.keys(receptionsModule).some((k) => /clearAll/i.test(k))).toBe(false);
  });

  it('el fuente no reintroduce delete masivo de series/receptions desde cliente', () => {
    const filePath = path.join(process.cwd(), 'src/lib/database/receptions.ts');
    const source = fs.readFileSync(filePath, 'utf8');
    expect(source).not.toMatch(/clearAllReceptions/);
    expect(source).not.toMatch(
      /from\(\s*['"]series['"]\s*\)\s*\.delete\(\)[\s\S]{0,120}\.neq\(\s*['"]id['"]/,
    );
    expect(source).not.toMatch(
      /from\(\s*['"]receptions['"]\s*\)\s*\.delete\(\)[\s\S]{0,120}\.neq\(\s*['"]id['"]/,
    );
  });
});
