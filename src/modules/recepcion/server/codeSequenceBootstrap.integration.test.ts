import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startEphemeralPostgres, type EphemeralPg } from './classifyEphemeralPostgres';

let pg: EphemeralPg;

function sql018019() {
  const cwd = process.cwd();
  return {
    box: readFileSync(join(cwd, 'supabase', '018_box_code_sequence.sql'), 'utf8'),
    os: readFileSync(join(cwd, 'supabase', '019_os_code_sequence.sql'), 'utf8'),
  };
}

beforeAll(async () => {
  pg = await startEphemeralPostgres();
  await pg.client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  await pg.client.query(`
    DO $$ BEGIN
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE ROLE anon;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await pg.client.query(`
    CREATE TABLE public.boxes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      box_code text NOT NULL UNIQUE,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.service_orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      os_label text NOT NULL,
      created_at timestamptz DEFAULT now()
    );
  `);
}, 60_000);

afterAll(() => {
  pg?.stop();
});

describe('018/019 sequence bootstrap', () => {
  it('empty tables: first BOX and TC codes start at 1', async () => {
    const { box, os } = sql018019();
    await pg.client.query(box);
    await pg.client.query(os);
    const boxCode = (await pg.client.query<{ c: string }>(`SELECT public.next_box_code() AS c`)).rows[0]?.c;
    const osCodes = (
      await pg.client.query<{ c: string[] }>(`SELECT public.next_os_codes(1) AS c`)
    ).rows[0]?.c;
    expect(boxCode).toBe('BOX-1');
    expect(osCodes).toEqual(['TC-000001']);
  });

  it('populated tables: next codes follow max without duplicates', async () => {
    await pg.client.query(`TRUNCATE public.boxes, public.service_orders CASCADE`);
    await pg.client.query(`INSERT INTO public.boxes (box_code) VALUES ('BOX-7'), ('BOX-12')`);
    await pg.client.query(`INSERT INTO public.service_orders (os_label) VALUES ('TC-000010')`);
    const { box, os } = sql018019();
    await pg.client.query(box);
    await pg.client.query(os);
    const nextBox = (await pg.client.query<{ c: string }>(`SELECT public.next_box_code() AS c`)).rows[0]?.c;
    const nextOs = (
      await pg.client.query<{ c: string[] }>(`SELECT public.next_os_codes(2) AS c`)
    ).rows[0]?.c;
    expect(nextBox).toBe('BOX-13');
    expect(nextOs).toEqual(['TC-000011', 'TC-000012']);
  });
});
