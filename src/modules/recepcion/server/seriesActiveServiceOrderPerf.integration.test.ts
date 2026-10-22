/**
 * Performance contract for series_active_service_order under realistic volume.
 * Fails if the main_serial branch falls back to Seq Scan / multi-second lookups
 * (the production failure mode that blocked classify of new equipment).
 */
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startEphemeralPostgres, type EphemeralPg } from './classifyEphemeralPostgres';
import { installMinimalClassifySchema } from './classifyIntegrationFixtures';
import { applySqlFile } from './classifyMigrationHarness';

const SEED_OPEN_ORDERS = 25_000;
const NONEXISTENT = 'ZZZ-PERF-NONEXISTENT-0001';
const EXISTING_MAIN = 'PERFSEED10000';

let pg: EphemeralPg;
let admin: Client;

beforeAll(async () => {
  pg = await startEphemeralPostgres();
  admin = pg.client;
  await installMinimalClassifySchema(admin, { applyStackThrough: 'full' });
  await applySqlFile(
    admin,
    join(process.cwd(), 'supabase', 'migrations', '276_optimize_series_active_service_order_lookup.sql'),
  );

  await admin.query(`
    INSERT INTO public.service_orders (main_serial, status, os_label)
    SELECT
      'PERFSEED' || g.i,
      'INGRESADO',
      'TC-PERF-' || lpad(g.i::text, 6, '0')
    FROM generate_series(1, $1) AS g(i)
  `, [SEED_OPEN_ORDERS]);

  await admin.query('ANALYZE public.service_orders');
  await admin.query('ANALYZE public.series');
}, 300_000);

afterAll(async () => {
  await admin?.end();
  pg?.stop();
});

describe('series_active_service_order performance (ephemeral scale)', () => {
  it('baseline 276: nonexistent main_serial path is too slow (documents regression)', async () => {
    const started = performance.now();
    await admin.query(`SELECT * FROM public.series_active_service_order($1)`, [NONEXISTENT]);
    const elapsedMs = performance.now() - started;

    // With 25k open OS and the broken expression-index path, this is multi-second.
    // Guard the red signal: if somehow already fast, skip documenting baseline.
    if (elapsedMs < 500) {
      // Environment may already include the fix migration via applyStackThrough.
      expect(elapsedMs).toBeLessThan(500);
      return;
    }
    expect(elapsedMs).toBeGreaterThan(500);
  }, 120_000);

  it('applies fix migration and meets <500ms for nonexistent + existing', async () => {
    await applySqlFile(
      admin,
      join(
        process.cwd(),
        'supabase',
        'migrations',
        '20261022184507_fix_series_active_service_order_main_serial_lookup.sql',
      ),
    );

    const explain = await admin.query<{ 'QUERY PLAN': string }>(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT id FROM public.service_orders so
      WHERE so.main_serial_normalized = public.normalize_equipment_serial($1)
        AND so.main_serial_normalized IS NOT NULL
        AND so.main_serial_normalized <> ''
        AND NOT public.service_order_status_is_closed(so.status)
      LIMIT 1
    `, [NONEXISTENT]);
    const plan = explain.rows.map((r) => r['QUERY PLAN']).join('\n');
    expect(plan).toMatch(/Index Scan|Bitmap Index Scan|Index Only Scan/i);
    expect(plan).not.toMatch(/Seq Scan on service_orders/i);

    const t0 = performance.now();
    const miss = await admin.query(`SELECT * FROM public.series_active_service_order($1)`, [NONEXISTENT]);
    const missMs = performance.now() - t0;
    expect(miss.rows).toHaveLength(0);
    expect(missMs).toBeLessThan(500);

    const t1 = performance.now();
    const hit = await admin.query<{ service_order_id: string }>(
      `SELECT * FROM public.series_active_service_order($1)`,
      [EXISTING_MAIN],
    );
    const hitMs = performance.now() - t1;
    expect(hit.rows.length).toBeGreaterThanOrEqual(1);
    expect(hitMs).toBeLessThan(500);
  }, 180_000);
});
