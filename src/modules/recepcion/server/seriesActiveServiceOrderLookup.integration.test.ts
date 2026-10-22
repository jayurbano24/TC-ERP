import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startEphemeralPostgres, type EphemeralPg } from './classifyEphemeralPostgres';
import { installMinimalClassifySchema } from './classifyIntegrationFixtures';
import { applySqlFile } from './classifyMigrationHarness';

const fullStackUrl = process.env.CLASSIFY_FULL_DATABASE_URL?.trim() || '';
const useFullStack = fullStackUrl.length > 0;
const scaleTest = process.env.SERIES_ACTIVE_SCALE_TEST === '1';

const TARGET_SERIAL = 'ZTEATV45500264360';
const MIGRATION_NAME = '276_optimize_series_active_service_order_lookup.sql';

let pg: EphemeralPg | undefined;
let admin: Client;

beforeAll(async () => {
  if (useFullStack) {
    admin = new Client({ connectionString: fullStackUrl });
    await admin.connect();
    const migPath = join(process.cwd(), 'supabase', 'migrations', MIGRATION_NAME);
    await applySqlFile(admin, migPath);
  } else {
    pg = await startEphemeralPostgres();
    admin = pg.client;
    await installMinimalClassifySchema(admin, { applyStackThrough: 'full' });
    const migPath = join(process.cwd(), 'supabase', 'migrations', MIGRATION_NAME);
    await applySqlFile(admin, migPath);
  }
}, 300_000);

afterAll(async () => {
  await admin?.end();
  await pg?.stop();
});

describe(`series_active_service_order lookup [${useFullStack ? 'full' : 'ephemeral'}]`, () => {
  it('función optimizada definida', async () => {
    const { rows } = await admin.query<{ def: string }>(`
      SELECT pg_get_functiondef('public.series_active_service_order(text)'::regprocedure) AS def
    `);
    expect(rows[0]?.def).toContain('serial_normalized');
    expect(rows[0]?.def).not.toMatch(/SECURITY DEFINER/i);
  });

  it('índices de lookup presentes', async () => {
    const { rows } = await admin.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'idx_series_serial_normalized',
          'idx_so_main_serial_equipment_normalized'
        )
    `);
    const names = rows.map((r) => r.indexname);
    expect(names).toContain('idx_series_serial_normalized');
    expect(names).toContain('idx_so_main_serial_equipment_normalized');
  });

  it('rendimiento y plan (scale/full stack) o tiempo acotado (ephemeral)', async () => {
    let representativeScale = false;
    if (scaleTest && useFullStack) {
      const { rows: counts } = await admin.query<{ series: string; so: string }>(`
        SELECT (SELECT count(*)::text FROM series) AS series,
               (SELECT count(*)::text FROM service_orders) AS so
      `);
      representativeScale =
        Number(counts[0]?.series) > 100_000 && Number(counts[0]?.so) > 50_000;
    }

    const explainSql =
      scaleTest && useFullStack && representativeScale
      ? `EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.series_active_service_order($1)`
      : `EXPLAIN (ANALYZE, BUFFERS)
         WITH sn AS (
           SELECT public.normalize_equipment_serial($1::text) AS serial
           WHERE public.is_valid_equipment_serial($1::text)
         )
         SELECT so.id FROM sn
         JOIN public.series s ON s.serial_normalized = sn.serial
         JOIN public.service_orders so ON so.id = s.service_order_id
         WHERE NOT public.service_order_status_is_closed(so.status)
           AND NOT public.series_status_is_terminal(s.current_status::text)
         LIMIT 1`;

    const { rows } = await admin.query<{ 'QUERY PLAN': string }>(explainSql, [TARGET_SERIAL]);

    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    expect(plan).toMatch(/Index Scan|Bitmap Index Scan|Index Only Scan/i);

    if (scaleTest && useFullStack && representativeScale) {
      expect(plan).not.toMatch(/Seq Scan on series/i);
      expect(plan).not.toMatch(/Seq Scan on service_orders/i);
      const executionMs = Number(plan.match(/Execution Time: ([0-9.]+) ms/)?.[1] ?? '9999');
      expect(executionMs).toBeLessThan(10);
    }
  }, 120_000);
});
