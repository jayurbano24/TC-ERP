import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startEphemeralPostgres, type EphemeralPg } from './classifyEphemeralPostgres';
import {
  classify,
  cleanupClassifyDataFullStack,
  closeEquipmentCycle,
  establishClassifyAuthSession,
  installMinimalClassifySchema,
  RECEPTION_ID,
  SAP_TRANSFER_ID,
  seedContext,
  seedContextFullStack,
  snapshot,
  truncateClassifyTables,
  withTimeout,
  type UnitPayload,
} from './classifyIntegrationFixtures';
import {
  applySqlFile,
  auditClassifyRpcState,
  countSerialCycleCloseTriggers,
  effectiveClassifyMigrationName,
  listLocalMigrations,
  readFunctionDef,
  readPublicClassifyFunctionDef,
  resolveClassifyStackPaths,
} from './classifyMigrationHarness';

const fullStackUrl = process.env.CLASSIFY_FULL_DATABASE_URL?.trim() || '';
const useFullStack = fullStackUrl.length > 0;

let pg: EphemeralPg | undefined;
let admin: Client;
let port: number;
let externalClient: Client | undefined;

beforeAll(async () => {
  if (useFullStack) {
    externalClient = new Client({ connectionString: fullStackUrl });
    await externalClient.connect();
    admin = externalClient;
    port = 54332;
    const { rows } = await admin.query<{ v: string }>('SELECT version() AS v');
    if (!rows[0]?.v.includes('PostgreSQL 15')) {
      throw new Error(`CLASSIFY_FULL_DATABASE_URL must be PostgreSQL 15.x (destino); got: ${rows[0]?.v}`);
    }
    const mig = await admin.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'normalize_equipment_serial'
       ) AS exists`
    );
    if (!mig.rows[0]?.exists) {
      throw new Error('Full stack DB missing classify stack (normalize_equipment_serial)');
    }
  } else {
    pg = await startEphemeralPostgres();
    admin = pg.client;
    port = pg.port;
    await installMinimalClassifySchema(admin, { applyStackThrough: 'full' });
  }
}, 120_000);

function createAuxiliaryClient(): Client {
  if (useFullStack) {
    return new Client({ connectionString: fullStackUrl });
  }
  return new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
}

async function connectAuxiliaryClient(client: Client) {
  await client.connect();
  if (useFullStack) {
    await establishClassifyAuthSession(client);
  }
}

beforeEach(async () => {
  if (useFullStack) {
    await admin.query('RESET ROLE');
    await cleanupClassifyDataFullStack(admin);
    await seedContextFullStack(admin);
    await establishClassifyAuthSession(admin);
  } else {
    await admin.query('RESET ROLE');
    await truncateClassifyTables(admin);
    await seedContext(admin);
  }
});

afterAll(async () => {
  if (externalClient) {
    await externalClient.end();
  } else {
    pg?.stop();
  }
});

describe(`classify_equipment_batch_tx [${useFullStack ? 'supabase full schema PG15' : 'focused minimal schema'}]`, () => {
  it('applies classify stack in Supabase lex order ending with 274', () => {
    const all = listLocalMigrations(join(process.cwd(), 'supabase', 'migrations'));
    const stack = resolveClassifyStackPaths(process.cwd()).map((p) => p.split(/[\\/]/).pop()!);
    const indices = stack.map((name) => all.indexOf(name));
    expect(indices.every((i) => i >= 0)).toBe(true);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
    }
    expect(effectiveClassifyMigrationName(process.cwd())).toBe(
      '274_classify_equipment_batch_tx_canonical_reapply.sql'
    );
  });

  it('exposes the final public RPC definition after migrations (pg_get_functiondef)', async () => {
    const def = await readPublicClassifyFunctionDef(admin);
    expect(def).toContain('classify-equipment-identity-final-v1');
    expect(def).toContain('EQUIPMENT_IDENTITY_MISMATCH');
    expect(def).toContain('classify_identity:');
    expect(def).toContain('classify_equipment_batch_tx_validated_write');
    expect(def).not.toContain('v_reentry_count := public.next_equipment_reentry_count');
  });

  it('installs a single terminal-status cycle-close trigger (normalized match)', async () => {
    expect(await countSerialCycleCloseTriggers(admin)).toBe(1);
    const triggerDef = await readFunctionDef(
      admin,
      'public.trg_close_serial_cycle_on_terminal_status()'
    );
    expect(triggerDef).toContain('normalize_equipment_serial');
    expect(triggerDef).not.toContain('upper(trim(serial_number))');
  });

  it('A: canonical RPC audit — single public 5-arg, no legacy 4-arg, writer not callable', async () => {
    const audit = await auditClassifyRpcState(admin);
    expect(audit.publicFiveArg).toBe(true);
    expect(audit.legacyFourArg).toBe(false);
    expect(audit.validatedWriteFiveArg).toBe(true);
    expect(audit.publicContainsPreflightMarker).toBe(true);
    expect(audit.publicContainsWriterOnlyMarker).toBe(false);
    expect(audit.privileges.public_authenticated).toBe(true);
    expect(audit.privileges.public_service_role).toBe(true);
    expect(audit.privileges.public_anon).toBe(false);
    expect(audit.privileges.writer_authenticated).toBe(false);
    expect(audit.privileges.writer_service_role).toBe(false);
    expect(audit.privileges.writer_anon).toBe(false);
  });

  it('B: applying compensatory migration 274 twice stays idempotent', async () => {
    const path274 = resolveClassifyStackPaths(process.cwd()).at(-1)!;
    await admin.query('RESET ROLE');
    await applySqlFile(admin, path274);
    await applySqlFile(admin, path274);
    const audit = await auditClassifyRpcState(admin);
    expect(audit.publicFiveArg).toBe(true);
    expect(audit.legacyFourArg).toBe(false);
    expect(await countSerialCycleCloseTriggers(admin)).toBe(1);
    if (useFullStack) {
      await establishClassifyAuthSession(admin);
    }
    await classify(admin, { main_serial: 'A1X', all_series: ['A1X', 'SHARED'] });
  });

  it.each(['SHARED', 'shared', ' SHARED '])(
    'rejects a second equipment whose secondary serial is %j instead of merging it',
    async (sharedSerial) => {
      await classify(admin, { main_serial: 'A1X', all_series: ['A1X', 'SHARED'] });

      const second = await classify(admin, {
        main_serial: 'B1X',
        all_series: ['B1X', sharedSerial],
      }).then(
        () => ({ rejected: false }),
        () => ({ rejected: true })
      );
      const state = await snapshot(admin);

      expect({
        secondRejected: second.rejected,
        serviceOrders: state.os.map((row) => row.main_serial),
        series: state.series.map((row) => row.serial_number),
        distinctSeriesOwners: new Set(state.series.map((row) => row.service_order_id)).size,
        distinctCycleOwners: new Set(
          state.cycles.filter((c) => c.unlinked_at === null).map((row) => row.service_order_id)
        ).size,
      }).toEqual({
        secondRejected: true,
        serviceOrders: ['A1X'],
        series: ['A1X', 'SHARED'],
        distinctSeriesOwners: 1,
        distinctCycleOwners: 1,
      });
    }
  );

  it('treats internal spaces and control chars as the same identity key', async () => {
    await classify(admin, { main_serial: 'A1X', all_series: ['A1X', 'SH ARE'] });

    await expect(
      classify(admin, { main_serial: 'B1X', all_series: ['B1X', 'SH\tARE'] })
    ).rejects.toThrow(/No hay equipos para clasificar|identidad|pertenece/i);

    const state = await snapshot(admin);
    expect(state.os).toHaveLength(1);
    expect(state.series.map((r) => r.serial_number).sort()).toEqual(['A1X', 'SHARE']);
  });

  it('closes the open cycle when dispatched serial used spaces/control chars in classify input', async () => {
    await classify(admin, { main_serial: 'A1X', all_series: ['A1X', 'SH ARE'] });
    const before = await snapshot(admin);
    const openBefore = before.cycles.filter((c) => c.unlinked_at === null);
    expect(openBefore).toHaveLength(2);
    expect(openBefore.map((c) => c.serial_number).sort()).toEqual(['A1X', 'SHARE']);

    await closeEquipmentCycle(admin, 'A1X');

    const after = await snapshot(admin);
    expect(after.cycles.filter((c) => c.unlinked_at === null)).toHaveLength(0);
    expect(after.cycles.filter((c) => c.unlinked_at !== null)).toHaveLength(2);
    expect(after.cycles.every((c) => c.serial_number === 'A1X' || c.serial_number === 'SHARE')).toBe(
      true
    );
  });

  it('skips the second unit in-batch when secondary serial collides (partial accept)', async () => {
    const res = await classify(admin, [
      { main_serial: 'A1X', all_series: ['A1X', 'SHARED'] },
      { main_serial: 'B1X', all_series: ['B1X', 'SHARED'] },
    ]);
    const payload = res.rows[0]?.result as {
      units_processed?: number;
      units_skipped?: number;
      errors?: Array<{ code?: string; main_serial?: string; serial?: string }>;
    };
    expect(payload.units_processed).toBe(1);
    expect(payload.units_skipped).toBe(1);
    expect(payload.errors).toEqual([
      expect.objectContaining({
        code: 'BATCH_SERIAL_CROSS_EQUIPMENT',
        main_serial: 'B1X',
        serial: 'SHARED',
      }),
    ]);
  });

  it('accepts two independent equipments with disjoint serial sets — each serial on its own OS', async () => {
    const res = await classify(admin, [
      { main_serial: 'A1X', all_series: ['A1X', 'S2-A'] },
      { main_serial: 'B1X', all_series: ['B1X', 'S2-B'] },
    ]);
    const payload = res.rows[0]?.result as { units_processed?: number };
    expect(payload.units_processed).toBe(2);
    const state = await snapshot(admin);
    expect(state.os.map((r) => r.main_serial).sort()).toEqual(['A1X', 'B1X']);
    expect(state.series).toHaveLength(4);

    const osA = state.os.find((o) => o.main_serial === 'A1X')!.id;
    const osB = state.os.find((o) => o.main_serial === 'B1X')!.id;
    expect(osA).not.toBe(osB);
    const ownerBySerial: Record<string, string> = {
      A1X: osA,
      'S2-A': osA,
      B1X: osB,
      'S2-B': osB,
    };
    for (const row of state.series) {
      expect(row.service_order_id).toBe(ownerBySerial[row.serial_number]);
    }
    expect(new Set(state.cycles.map((c) => c.service_order_id)).size).toBe(2);
  });

  it('is idempotent on exact retry — same OS, two cycles, reentry_count stays 1', async () => {
    const unit = { main_serial: 'A1X', all_series: ['A1X', 'SHARED'] };
    await classify(admin, unit, { correlation: 'retry-1' });
    await classify(admin, unit, { correlation: 'retry-2' });

    const state = await snapshot(admin);
    expect(state.os).toHaveLength(1);
    expect(state.os[0]?.reentry_count).toBe(1);
    expect(state.series.map((r) => r.serial_number).sort()).toEqual(['A1X', 'SHARED']);
    expect(state.cycles).toHaveLength(2);
    expect(state.cycles.every((c) => c.unlinked_at === null)).toBe(true);
  });

  it('rejects a changed serial set (EQUIPMENT_IDENTITY_MISMATCH) instead of expanding equipment', async () => {
    await classify(admin, { main_serial: 'A1X', all_series: ['A1X', 'SHARED'] });

    await expect(
      classify(admin, { main_serial: 'A1X', all_series: ['A1X', 'SHARED', 'NEW-SERIAL'] })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/No hay equipos para clasificar|identidad/i),
    });

    const state = await snapshot(admin);
    expect(state.series.map((row) => row.serial_number).sort()).toEqual(['A1X', 'SHARED']);
    expect(state.cycles).toHaveLength(2);
  });

  it('late writer conflict (A-NEW vs B2X) leaves no partial OS for the failed unit', async () => {
    await classify(admin, { main_serial: 'A-NEW', all_series: ['A-NEW', 'B2X'] });

    await expect(
      classify(admin, { main_serial: 'B2X', all_series: ['B2X', 'B2X-ALT'] })
    ).rejects.toThrow(/No hay equipos para clasificar|activa|identidad/i);

    const state = await snapshot(admin);
    expect(state.os.map((o) => o.main_serial)).toEqual(['A-NEW']);
    expect(state.series.map((s) => s.serial_number).sort()).toEqual(['A-NEW', 'B2X']);
    expect(state.series.every((s) => s.service_order_id === state.os[0]?.id)).toBe(true);
    expect(state.os.some((o) => o.main_serial === 'B2X')).toBe(false);
  });

  it('rolls back a unit when a secondary serial is already active elsewhere (no OK-SEC reassignment)', async () => {
    await classify(admin, { main_serial: 'X10', all_series: ['X10', 'OK-SEC'] });

    await expect(
      classify(admin, { main_serial: 'OK-MAIN', all_series: ['OK-MAIN', 'OK-SEC'] })
    ).rejects.toThrow(/No hay equipos para clasificar|activa/i);

    const state = await snapshot(admin);
    expect(state.os.map((o) => o.main_serial)).toEqual(['X10']);
    expect(state.series.find((s) => s.serial_number === 'OK-MAIN')).toBeUndefined();
    expect(state.cycles.filter((c) => c.serial_number === 'OK-MAIN')).toHaveLength(0);
    const secOwner = state.series.find((s) => s.serial_number === 'OK-SEC')?.service_order_id;
    expect(secOwner).toBe(state.os[0]?.id);
  });

  it('concurrent identical retries: same OS or transient failure then retry converges', async () => {
    const unit: UnitPayload = { main_serial: 'A1X', all_series: ['A1X', 'SHARED'] };
    const a = createAuxiliaryClient();
    const b = createAuxiliaryClient();
    await Promise.all([connectAuxiliaryClient(a), connectAuxiliaryClient(b)]);
    try {
      const results = await Promise.allSettled([
        classify(a, unit, { correlation: 'dup-a' }),
        classify(b, unit, { correlation: 'dup-b' }),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length + rejected.length).toBe(2);

      let state = await snapshot(admin);
      expect(state.os).toHaveLength(1);
      const osId = state.os[0]?.id as string;

      if (fulfilled.length === 2) {
        const r0 = (fulfilled[0] as PromiseFulfilledResult<{ rows: { result: { service_orders: { id: string }[] } }[] }>)
          .value.rows[0]?.result;
        const r1 = (fulfilled[1] as PromiseFulfilledResult<{ rows: { result: { service_orders: { id: string }[] } }[] }>)
          .value.rows[0]?.result;
        expect(r0?.service_orders?.[0]?.id).toBe(osId);
        expect(r1?.service_orders?.[0]?.id).toBe(osId);
      } else {
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(1);
        await classify(admin, unit, { correlation: 'dup-retry' });
        state = await snapshot(admin);
        expect(state.os).toHaveLength(1);
        expect(state.os[0]?.id).toBe(osId);
      }

      expect(state.series).toHaveLength(2);
      expect(state.cycles).toHaveLength(2);
      expect(state.cycles.every((c) => c.service_order_id === osId)).toBe(true);
    } finally {
      await Promise.all([a.end(), b.end()]);
    }
  });

  it('concurrent distinct equipments sharing secondary: barriered interleave → 1 OS, 2 series, 1 open SHARED cycle', async () => {
    const hold = createAuxiliaryClient();
    const rival = createAuxiliaryClient();
    await Promise.all([connectAuxiliaryClient(hold), connectAuxiliaryClient(rival)]);

    try {
      await hold.query('BEGIN');
      await classify(hold, { main_serial: 'A1X', all_series: ['A1X', 'SHARED'] });
      const rivalPromise = classify(rival, { main_serial: 'B1X', all_series: ['B1X', 'SHARED'] });
      await hold.query('COMMIT');

      const rivalResult = await withTimeout(
        rivalPromise.then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error })
        ),
        8_000,
        'concurrent SHARED classify'
      );

      expect(rivalResult.ok).toBe(false);

      const state = await snapshot(admin);
      expect(state.os).toHaveLength(1);
      expect(state.series).toHaveLength(2);
      const openShared = state.cycles.filter(
        (c) => c.unlinked_at === null && c.serial_number === 'SHARED'
      );
      expect(openShared).toHaveLength(1);
      expect(state.cycles.filter((c) => c.unlinked_at === null)).toHaveLength(2);
    } finally {
      await Promise.all([hold.end(), rival.end()]);
    }
  });

  it('allows legitimate reentry — 2 closed + 2 open cycles, reentry_count 2', async () => {
    await classify(admin, { main_serial: 'A1X', all_series: ['A1X', 'SHARED'] });
    await closeEquipmentCycle(admin, 'A1X');

    await classify(admin, { main_serial: 'A1X', all_series: ['A1X', 'SHARED'] }, { correlation: 'reentry' });

    const state = await snapshot(admin);
    expect(state.os.filter((r) => r.status === 'INGRESADO')).toHaveLength(1);
    expect(state.os.filter((r) => r.status === 'DESPACHADO')).toHaveLength(1);
    expect(state.os.find((r) => r.status === 'INGRESADO')?.reentry_count).toBe(2);
    expect(state.cycles.filter((c) => c.unlinked_at !== null)).toHaveLength(2);
    expect(state.cycles.filter((c) => c.unlinked_at === null)).toHaveLength(2);
    expect(state.cycles).toHaveLength(4);
  });

  it('F: anon cannot execute public or writer classify RPCs', async () => {
    const audit = await auditClassifyRpcState(admin);
    expect(audit.privileges.public_anon).toBe(false);
    expect(audit.privileges.writer_anon).toBe(false);
  });

  // Autenticación real (GoTrue + PostgREST): classifyEquipmentHttpAuth.integration.test.ts
  it.skipIf(useFullStack)('[minimal simulation] wrapper enforces auth.uid() when auth.uid() is stubbed in-session', async () => {
    await admin.query(`
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    `);
    await expect(
      classify(admin, { main_serial: 'A1X', all_series: ['A1X'] })
    ).rejects.toThrow(/Not authenticated/i);
    await admin.query(`
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT '90000000-0000-0000-0000-000000000001'::uuid $$;
    `);
  });
});
