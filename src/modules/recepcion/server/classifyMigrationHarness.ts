import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Client } from 'pg';

/** Mismo orden que Supabase CLI (`migration list` / carpeta `supabase/migrations`). */
export function listLocalMigrations(migrationsDir: string): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
}

/** Cadena classify (orden lexicográfico real, post-177). */
export const CLASSIFY_STACK_FILENAMES = [
  '177_restore_classify_active_os_guards.sql',
  '20261020001356_classify_exact_serial_set_retry.sql',
  '272_classify_exact_equipment_identity.sql',
  '273_classify_equipment_batch_identity_final.sql',
  '274_classify_equipment_batch_tx_canonical_reapply.sql',
] as const;

export function resolveClassifyStackPaths(cwd: string): string[] {
  const dir = join(cwd, 'supabase', 'migrations');
  const all = listLocalMigrations(dir);
  const missing = CLASSIFY_STACK_FILENAMES.filter((name) => !all.includes(name));
  if (missing.length > 0) {
    throw new Error(`Missing classify stack migrations: ${missing.join(', ')}`);
  }
  const stack = [...CLASSIFY_STACK_FILENAMES];
  const sorted = [...stack].sort((a, b) => a.localeCompare(b));
  if (stack.join('|') !== sorted.join('|')) {
    throw new Error(
      `CLASSIFY_STACK_FILENAMES must match Supabase lex order; got ${stack.join(', ')} vs ${sorted.join(', ')}`
    );
  }
  for (let i = 1; i < stack.length; i++) {
    const leftIdx = all.indexOf(stack[i - 1]!);
    const rightIdx = all.indexOf(stack[i]!);
    if (rightIdx <= leftIdx) {
      throw new Error(
        `Classify stack out of Supabase order: ${stack[i - 1]} (idx ${leftIdx}) before ${stack[i]} (idx ${rightIdx})`
      );
    }
  }
  return stack.map((name) => join(dir, name));
}

export function effectiveClassifyMigrationName(cwd: string): string {
  return CLASSIFY_STACK_FILENAMES[CLASSIFY_STACK_FILENAMES.length - 1];
}

export async function readPublicClassifyFunctionDef(client: Client): Promise<string> {
  const { rows } = await client.query<{ def: string }>(`
    SELECT pg_get_functiondef(
      'public.classify_equipment_batch_tx(uuid, uuid, jsonb, text, text)'::regprocedure
    ) AS def
  `);
  return rows[0]?.def ?? '';
}

export type ClassifyRpcAudit = {
  publicFiveArg: boolean;
  legacyFourArg: boolean;
  validatedWriteFiveArg: boolean;
  privileges: {
    public_authenticated: boolean;
    public_service_role: boolean;
    public_anon: boolean;
    writer_authenticated: boolean;
    writer_service_role: boolean;
    writer_anon: boolean;
  };
  publicContainsPreflightMarker: boolean;
  publicContainsWriterOnlyMarker: boolean;
};

export async function auditClassifyRpcState(client: Client): Promise<ClassifyRpcAudit> {
  const procs = await client.query<{ proname: string; args: string }>(`
    SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('classify_equipment_batch_tx', 'classify_equipment_batch_tx_validated_write')
    ORDER BY p.proname, args
  `);

  const publicRows = procs.rows.filter((r) => r.proname === 'classify_equipment_batch_tx');
  const publicFiveArg = publicRows.some((r) => r.args.split(',').length === 5);
  const legacyFourArg = publicRows.some((r) => r.args.split(',').length === 4);
  const validatedWriteFiveArg = procs.rows.some(
    (r) => r.proname === 'classify_equipment_batch_tx_validated_write' && r.args.split(',').length === 5
  );

  const priv = await client.query<{
    public_authenticated: boolean;
    public_service_role: boolean;
    public_anon: boolean;
    writer_authenticated: boolean;
    writer_service_role: boolean;
    writer_anon: boolean;
  }>(
    validatedWriteFiveArg
      ? `
    SELECT
      has_function_privilege('authenticated', 'public.classify_equipment_batch_tx(uuid,uuid,jsonb,text,text)', 'EXECUTE') AS public_authenticated,
      has_function_privilege('service_role', 'public.classify_equipment_batch_tx(uuid,uuid,jsonb,text,text)', 'EXECUTE') AS public_service_role,
      has_function_privilege('anon', 'public.classify_equipment_batch_tx(uuid,uuid,jsonb,text,text)', 'EXECUTE') AS public_anon,
      has_function_privilege('authenticated', 'public.classify_equipment_batch_tx_validated_write(uuid,uuid,jsonb,text,text)', 'EXECUTE') AS writer_authenticated,
      has_function_privilege('service_role', 'public.classify_equipment_batch_tx_validated_write(uuid,uuid,jsonb,text,text)', 'EXECUTE') AS writer_service_role,
      has_function_privilege('anon', 'public.classify_equipment_batch_tx_validated_write(uuid,uuid,jsonb,text,text)', 'EXECUTE') AS writer_anon
  `
      : `
    SELECT
      has_function_privilege('authenticated', 'public.classify_equipment_batch_tx(uuid,uuid,jsonb,text,text)', 'EXECUTE') AS public_authenticated,
      has_function_privilege('service_role', 'public.classify_equipment_batch_tx(uuid,uuid,jsonb,text,text)', 'EXECUTE') AS public_service_role,
      has_function_privilege('anon', 'public.classify_equipment_batch_tx(uuid,uuid,jsonb,text,text)', 'EXECUTE') AS public_anon,
      false AS writer_authenticated,
      false AS writer_service_role,
      false AS writer_anon
  `
  );

  const def = publicFiveArg ? await readPublicClassifyFunctionDef(client) : '';

  return {
    publicFiveArg,
    legacyFourArg,
    validatedWriteFiveArg,
    privileges: priv.rows[0] ?? {
      public_authenticated: false,
      public_service_role: false,
      public_anon: false,
      writer_authenticated: false,
      writer_service_role: false,
      writer_anon: false,
    },
    publicContainsPreflightMarker: def.includes('classify-equipment-identity-final-v1'),
    publicContainsWriterOnlyMarker:
      def.includes('v_reentry_count := public.next_equipment_reentry_count') &&
      !def.includes('classify_equipment_batch_tx_validated_write'),
  };
}

export async function applySqlFile(client: Client, path: string): Promise<void> {
  const sql = readFileSync(path, 'utf8');
  await client.query(sql);
}

export async function readFunctionDef(
  client: Client,
  signature: string
): Promise<string> {
  const { rows } = await client.query<{ def: string }>(
    `SELECT pg_get_functiondef($1::regprocedure) AS def`,
    [signature]
  );
  return rows[0]?.def ?? '';
}

export async function countSerialCycleCloseTriggers(client: Client): Promise<number> {
  const { rows } = await client.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM pg_trigger
    WHERE tgname = 'trg_close_serial_cycle_on_terminal_status'
      AND NOT tgisinternal
  `);
  return Number(rows[0]?.count ?? 0);
}

/** Estado previo a 273/274: 177 + 4-arg legacy + preflight 202610 + escritor 272. */
export async function installPreRepairClassifyState(client: Client, cwd: string): Promise<void> {
  const { installMinimalClassifySchema, extractFunction } = await import('./classifyIntegrationFixtures');
  await installMinimalClassifySchema(client, { applyStackThrough: 'none' });

  const migration177 = readFileSync(join(cwd, 'supabase', 'migrations', '177_restore_classify_active_os_guards.sql'), 'utf8');
  await client.query(extractFunction(migration177, 'series_active_service_order'));
  await client.query(extractFunction(migration177, 'classify_equipment_batch_tx'));

  const migration029 = readFileSync(
    join(cwd, 'supabase', 'migrations', '029_classify_equipment_batch_tx.sql'),
    'utf8'
  );
  await client.query(extractFunction(migration029, 'classify_equipment_batch_tx'));

  await applySqlFile(
    client,
    join(cwd, 'supabase', 'migrations', '20261020001356_classify_exact_serial_set_retry.sql')
  );
  await applySqlFile(client, join(cwd, 'supabase', 'migrations', '272_classify_exact_equipment_identity.sql'));
}

/** Simula despliegue roto: RPC pública = cuerpo del escritor 272 (sin preflight). */
export async function promoteWriterBodyToPublicRpc(client: Client): Promise<void> {
  const writerDef = await readFunctionDef(
    client,
    'public.classify_equipment_batch_tx_validated_write(uuid,uuid,jsonb,text,text)'
  );
  if (!writerDef.includes('classify_equipment_batch_tx_validated_write')) {
    throw new Error('Expected validated_write definition before promoting to public');
  }
  const publicDef = writerDef.replaceAll(
    'classify_equipment_batch_tx_validated_write',
    'classify_equipment_batch_tx'
  );
  await client.query(publicDef);
}

export async function applyClassifyRepairMigration(client: Client, cwd: string): Promise<void> {
  const path274 = join(cwd, 'supabase', 'migrations', '274_classify_equipment_batch_tx_canonical_reapply.sql');
  await applySqlFile(client, path274);
}
