import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('part harvest cases migration', () => {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const name = readdirSync(dir).find((file) => file.includes('part_harvest_cases'))!;
  const sql = readFileSync(join(dir, name), 'utf8');

  it('agrupa sesiones donantes en un caso indexado', () => {
    expect(sql).toContain('case_id');
    expect(sql).toMatch(/CREATE INDEX[\s\S]*case_id/i);
    expect(sql).toContain('gen_random_uuid()');
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]*case_id[\s\S]*series_id/i);
  });
});
