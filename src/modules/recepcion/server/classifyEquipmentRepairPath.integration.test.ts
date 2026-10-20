import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startEphemeralPostgres, type EphemeralPg } from './classifyEphemeralPostgres';
import {
  classify,
  extractFunction,
  installMinimalClassifySchema,
  seedContext,
  snapshot,
} from './classifyIntegrationFixtures';
import {
  applyClassifyRepairMigration,
  applySqlFile,
  auditClassifyRpcState,
  countSerialCycleCloseTriggers,
  installPreRepairClassifyState,
  promoteWriterBodyToPublicRpc,
  readFunctionDef,
  readPublicClassifyFunctionDef,
} from './classifyMigrationHarness';
import { readFileSync } from 'node:fs';

let pg: EphemeralPg | undefined;
const cwd = process.cwd();

beforeEach(async () => {
  pg = await startEphemeralPostgres();
}, 120_000);

afterEach(async () => {
  pg?.stop();
  pg = undefined;
});

describe('classify repair path [177 + 4-arg + 202610 + 272 → 274]', () => {
  it('legacy 4-arg overload exists after 177+029 (before 202610 retires it)', async () => {
    const client = pg!.client;
    await installMinimalClassifySchema(client, { applyStackThrough: 'none' });
    const migration177 = readFileSync(
      join(cwd, 'supabase', 'migrations', '177_restore_classify_active_os_guards.sql'),
      'utf8'
    );
    await client.query(extractFunction(migration177, 'series_active_service_order'));
    await client.query(extractFunction(migration177, 'classify_equipment_batch_tx'));
    const migration029 = readFileSync(
      join(cwd, 'supabase', 'migrations', '029_classify_equipment_batch_tx.sql'),
      'utf8'
    );
    await client.query(extractFunction(migration029, 'classify_equipment_batch_tx'));

    const audit = await auditClassifyRpcState(client);
    expect(audit.legacyFourArg).toBe(true);
    expect(audit.publicFiveArg).toBe(true);

    const legacyDef = await readFunctionDef(
      client,
      'public.classify_equipment_batch_tx(uuid,uuid,jsonb,text)'
    );
    expect(legacyDef).toContain('classify_equipment_batch_tx');
    expect(legacyDef).not.toContain('classify_equipment_batch_tx_validated_write');
  });

  it('pre-repair stack: preflight 5-arg + writer 5-arg (pg_get_functiondef, not hashes)', async () => {
    const client = pg!.client;
    await installPreRepairClassifyState(client, cwd);
    await seedContext(client);

    const audit = await auditClassifyRpcState(client);
    expect(audit.legacyFourArg).toBe(false);
    expect(audit.publicFiveArg).toBe(true);
    expect(audit.validatedWriteFiveArg).toBe(true);
    expect(audit.publicContainsPreflightMarker).toBe(false);

    const publicDef = await readPublicClassifyFunctionDef(client);
    const writerDef = await readFunctionDef(
      client,
      'public.classify_equipment_batch_tx_validated_write(uuid,uuid,jsonb,text,text)'
    );
    expect(publicDef).toContain('classify_equipment_batch_tx_validated_write');
    expect(publicDef).toContain('classify_identity:');
    expect(writerDef).toMatch(/classify_(identity|main|serial):/);
    expect(writerDef).not.toContain('classify-equipment-identity-final-v1');
  });

  it('broken deploy: public monolith = writer body, then 274 restores wrapper + permissions', async () => {
    const client = pg!.client;
    await installPreRepairClassifyState(client, cwd);
    await seedContext(client);

    await promoteWriterBodyToPublicRpc(client);
    let audit = await auditClassifyRpcState(client);
    expect(audit.publicContainsPreflightMarker).toBe(false);
    expect(audit.publicContainsWriterOnlyMarker).toBe(true);

    await applyClassifyRepairMigration(client, cwd);
    await applyClassifyRepairMigration(client, cwd);

    audit = await auditClassifyRpcState(client);
    expect(audit.publicFiveArg).toBe(true);
    expect(audit.legacyFourArg).toBe(false);
    expect(audit.publicContainsPreflightMarker).toBe(true);
    expect(audit.publicContainsWriterOnlyMarker).toBe(false);
    expect(audit.privileges.writer_authenticated).toBe(false);
    expect(await countSerialCycleCloseTriggers(client)).toBe(1);

    const publicDef = await readPublicClassifyFunctionDef(client);
    expect(publicDef).toContain('classify-equipment-identity-final-v1');
    expect(publicDef).toContain('classify_equipment_batch_tx_validated_write');

    await classify(client, { main_serial: 'A1X', all_series: ['A1X', 'SHARED'] });
    await expect(
      classify(client, { main_serial: 'B1X', all_series: ['B1X', 'SHARED'] })
    ).rejects.toThrow(/No hay equipos para clasificar|identidad|pertenece/i);

    const state = await snapshot(client);
    expect(state.os).toHaveLength(1);
    expect(state.series).toHaveLength(2);
  });

  it('177 OR-merge regression: second equipment merged pre-274, rejected post-274', async () => {
    const client = pg!.client;
    await installMinimalClassifySchema(client, { applyStackThrough: 'none' });
    const migration177 = readFileSync(
      join(cwd, 'supabase', 'migrations', '177_restore_classify_active_os_guards.sql'),
      'utf8'
    );
    await client.query(extractFunction(migration177, 'series_active_service_order'));
    await client.query(extractFunction(migration177, 'classify_equipment_batch_tx'));
    await seedContext(client);

    await classify(client, { main_serial: 'A1X', all_series: ['A1X', 'SHARED'] });
    await classify(client, { main_serial: 'B1X', all_series: ['B1X', 'SHARED'] });

    const merged = await snapshot(client);
    expect(merged.os).toHaveLength(1);
    expect(merged.series.map((s) => s.serial_number).sort()).toEqual(['A1X', 'B1X', 'SHARED']);

    await applySqlFile(
      client,
      join(cwd, 'supabase', 'migrations', '274_classify_equipment_batch_tx_canonical_reapply.sql')
    );
    await client.query(
      'TRUNCATE public.service_order_serial_cycles, public.series, public.service_orders RESTART IDENTITY CASCADE'
    );
    await seedContext(client);

    await classify(client, { main_serial: 'A1X', all_series: ['A1X', 'SHARED'] });
    await expect(
      classify(client, { main_serial: 'B1X', all_series: ['B1X', 'SHARED'] })
    ).rejects.toThrow(/No hay equipos para clasificar|identidad|pertenece/i);

    const fixed = await snapshot(client);
    expect(fixed.os).toHaveLength(1);
    expect(fixed.series).toHaveLength(2);
  });
});
