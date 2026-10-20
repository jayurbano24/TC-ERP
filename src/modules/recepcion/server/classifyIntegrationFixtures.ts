import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Client } from 'pg';
import {
  applySqlFile,
  resolveClassifyStackPaths,
} from './classifyMigrationHarness';

export const INTEGRATION_AUTH_USER_ID = '90000000-0000-0000-0000-000000000001';

export const RECEPTION_ID = '10000000-0000-0000-0000-000000000001';
export const RECEPTION_ID_B = '10000000-0000-0000-0000-000000000002';
export const GUIDE_ID = '20000000-0000-0000-0000-000000000001';
export const SAP_TRANSFER_ID = '30000000-0000-0000-0000-000000000001';
export const SAP_TRANSFER_ID_B = '30000000-0000-0000-0000-000000000002';

export type UnitPayload = { main_serial: string; all_series: string[] };

export function extractFunction(sql: string, functionName: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}(`);
  if (start < 0) throw new Error(`Function ${functionName} not found in migration`);
  const end = sql.indexOf('\n$$;', start);
  if (end < 0) throw new Error(`Function ${functionName} has no terminator`);
  return sql.slice(start, end + 4);
}

export async function installMinimalClassifySchema(
  client: Client,
  opts: { applyStackThrough?: 'none' | 'full' | 'through272' } = {}
) {
  const cwd = process.cwd();
  const migration140 = readFileSync(
    join(cwd, 'supabase', 'migrations', '140_os_serial_reentry_domain_rules.sql'),
    'utf8'
  );

  await client.query(`
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT '90000000-0000-0000-0000-000000000001'::uuid $$;

    CREATE SEQUENCE public.os_number_seq;

    CREATE TABLE public.sap_transfer_documents (
      id uuid PRIMARY KEY,
      reception_id uuid NOT NULL,
      reception_guide_id uuid NOT NULL
    );

    CREATE TABLE public.service_orders (
      id uuid PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text)::uuid,
      os_label text NOT NULL DEFAULT ('TC-' || lpad(nextval('public.os_number_seq')::text, 5, '0')),
      reception_id uuid,
      reception_guide_id uuid,
      sap_transfer_id uuid,
      model_id uuid,
      brand_id uuid,
      main_serial text NOT NULL,
      reentry_count integer NOT NULL DEFAULT 1,
      status text NOT NULL DEFAULT 'INGRESADO',
      closed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.series (
      id uuid PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text)::uuid,
      serial_number text NOT NULL UNIQUE,
      current_reception_id uuid,
      service_order_id uuid REFERENCES public.service_orders(id),
      sap_transfer_id uuid,
      current_status text NOT NULL,
      model_id uuid,
      brand_id uuid,
      material text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.service_order_serial_cycles (
      id uuid PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text)::uuid,
      serial_number text NOT NULL,
      service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
      cycle_no integer NOT NULL DEFAULT 1,
      linked_at timestamptz NOT NULL DEFAULT now(),
      unlinked_at timestamptz,
      UNIQUE (serial_number, service_order_id)
    );

    CREATE FUNCTION public.upsert_cac_tray_unit_from_os(uuid, text)
    RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
  `);

  for (const name of [
    'is_valid_equipment_serial',
    'service_order_status_is_closed',
    'series_status_is_terminal',
    'equipment_closed_cycle_count',
    'next_equipment_reentry_count',
    'trg_series_service_order_guard',
  ]) {
    await client.query(extractFunction(migration140, name));
  }

  await client.query(`
    CREATE TRIGGER trg_series_service_order_guard
      BEFORE INSERT OR UPDATE OF service_order_id, current_status, serial_number
      ON public.series
      FOR EACH ROW
      EXECUTE PROCEDURE public.trg_series_service_order_guard();

    CREATE UNIQUE INDEX uniq_service_orders_active_main_serial
      ON public.service_orders (upper(trim(main_serial)))
      WHERE NOT public.service_order_status_is_closed(status)
        AND public.is_valid_equipment_serial(main_serial);

    CREATE UNIQUE INDEX uniq_service_order_serial_cycles_open_serial
      ON public.service_order_serial_cycles (upper(trim(serial_number)))
      WHERE unlinked_at IS NULL;
  `);

  const stackMode = opts.applyStackThrough ?? 'full';
  if (stackMode === 'none') return;

  const stackPaths = resolveClassifyStackPaths(cwd);
  const through272Idx = stackPaths.findIndex((p) => p.includes('272_classify'));
  const endIdx =
    stackMode === 'through272' && through272Idx >= 0 ? through272Idx + 1 : stackPaths.length;

  for (const path of stackPaths.slice(0, endIdx)) {
    await applySqlFile(client, path);
  }
}

export async function seedContext(
  client: Client,
  opts: { receptionId?: string; sapId?: string; guideId?: string } = {}
) {
  const receptionId = opts.receptionId ?? RECEPTION_ID;
  const sapId = opts.sapId ?? SAP_TRANSFER_ID;
  const guideId = opts.guideId ?? GUIDE_ID;
  await client.query(
    `INSERT INTO public.sap_transfer_documents (id, reception_id, reception_guide_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [sapId, receptionId, guideId]
  );
}

/** Esquema completo (Supabase local): FK receptions → guides → sap_transfer_documents. */
/** Sesión authenticated compatible con Supabase local (auth.uid() vía JWT claim). */
export async function establishClassifyAuthSession(client: Client) {
  await client.query('SET ROLE authenticated');
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [
    INTEGRATION_AUTH_USER_ID,
  ]);
  await client.query(
    `SELECT set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: INTEGRATION_AUTH_USER_ID, role: 'authenticated' })]
  );
}

export async function seedContextFullStack(
  client: Client,
  opts: { receptionId?: string; sapId?: string; guideId?: string } = {}
) {
  const receptionId = opts.receptionId ?? RECEPTION_ID;
  const sapId = opts.sapId ?? SAP_TRANSFER_ID;
  const guideId = opts.guideId ?? GUIDE_ID;
  await client.query(
    `INSERT INTO public.receptions (id, source, guide_number)
     VALUES ($1, 'cac'::public.reception_source, 'INT-TEST-GUIDE')
     ON CONFLICT (id) DO NOTHING`,
    [receptionId]
  );
  await client.query(
    `DELETE FROM public.reception_guides
     WHERE reception_id = $1 AND guide_number = 'INT-TEST-GUIDE' AND id <> $2::uuid`,
    [receptionId, guideId]
  );
  await client.query(
    `INSERT INTO public.reception_guides (id, reception_id, guide_number, category, status)
     VALUES ($1, $2, 'INT-TEST-GUIDE', 'equipo', 'PENDIENTE')
     ON CONFLICT (id) DO UPDATE SET
       reception_id = EXCLUDED.reception_id,
       guide_number = EXCLUDED.guide_number,
       category = EXCLUDED.category,
       status = EXCLUDED.status`,
    [guideId, receptionId]
  );
  await client.query(
    `INSERT INTO public.sap_transfer_documents (id, reception_id, reception_guide_id, sap_document_number, status)
     VALUES ($1, $2, $3, 'SAP-INT-TEST-001', 'PENDIENTE_INGRESO_BODEGA')
     ON CONFLICT (id) DO NOTHING`,
    [sapId, receptionId, guideId]
  );
}

const INTEGRATION_SERIALS = [
  'HTTP1',
  'HTTP-S2',
  'A1X',
  'B1X',
  'SHARED',
  'SHARE',
  'S2-A',
  'S2-B',
  'A-NEW',
  'B2X',
  'B2X-ALT',
  'X10',
  'OK-SEC',
  'OK-MAIN',
  'NEW-SERIAL',
] as const;

export async function cleanupClassifyDataFullStack(client: Client) {
  const params = [RECEPTION_ID, RECEPTION_ID_B, SAP_TRANSFER_ID, SAP_TRANSFER_ID_B];
  const osFilter = `SELECT id FROM public.service_orders
    WHERE reception_id IN ($1::uuid, $2::uuid)
       OR sap_transfer_id IN ($3::uuid, $4::uuid)
       OR upper(trim(main_serial)) = ANY($5::text[])`;
  const serialKeys = INTEGRATION_SERIALS.map((s) => s.toUpperCase());
  const allParams = [...params, serialKeys];

  await client.query(
    `DELETE FROM public.service_order_serial_cycles
     WHERE service_order_id IN (${osFilter})
        OR upper(trim(serial_number)) = ANY($5::text[])`,
    allParams
  );
  await client.query(
    `DELETE FROM public.series
     WHERE service_order_id IN (${osFilter})
        OR sap_transfer_id IN ($3::uuid, $4::uuid)
        OR upper(trim(serial_number)) = ANY($5::text[])`,
    allParams
  );
  await client.query(
    `DELETE FROM public.service_orders
     WHERE reception_id IN ($1::uuid, $2::uuid)
        OR sap_transfer_id IN ($3::uuid, $4::uuid)
        OR upper(trim(main_serial)) = ANY($5::text[])`,
    allParams
  );
  await client.query(
    `DELETE FROM public.sap_transfer_documents WHERE id IN ($1::uuid, $2::uuid)`,
    [SAP_TRANSFER_ID, SAP_TRANSFER_ID_B]
  );
  await client.query(
    `DELETE FROM public.reception_guides
     WHERE reception_id IN ($1::uuid, $2::uuid)
        OR guide_number IN ('INT-TEST-GUIDE', 'INT-TEST-GUIDE-B')`,
    [RECEPTION_ID, RECEPTION_ID_B]
  );
  await client.query(`DELETE FROM public.receptions WHERE id IN ($1::uuid, $2::uuid)`, [
    RECEPTION_ID,
    RECEPTION_ID_B,
  ]);
}

export async function classify(
  client: Client,
  units: UnitPayload | UnitPayload[],
  opts: { receptionId?: string; sapId?: string; correlation?: string } = {}
) {
  const batch = Array.isArray(units) ? units : [units];
  const receptionId = opts.receptionId ?? RECEPTION_ID;
  const sapId = opts.sapId ?? SAP_TRANSFER_ID;
  const correlation = opts.correlation ?? `test-${batch[0]?.main_serial ?? 'batch'}`;
  return client.query(
    `SELECT public.classify_equipment_batch_tx($1, $2, $3::jsonb, 'integration-test', $4) AS result`,
    [receptionId, sapId, JSON.stringify(batch), correlation]
  );
}

export async function snapshot(client: Client) {
  await client.query('RESET ROLE');
  const os = await client.query(
    `SELECT id, main_serial, reentry_count, status, reception_id, sap_transfer_id
       FROM public.service_orders ORDER BY main_serial, created_at`
  );
  const series = await client.query(
    `SELECT serial_number, service_order_id FROM public.series ORDER BY serial_number`
  );
  const cycles = await client.query(
    `SELECT serial_number, service_order_id, unlinked_at, cycle_no
       FROM public.service_order_serial_cycles
      ORDER BY serial_number, linked_at`
  );
  return { os: os.rows, series: series.rows, cycles: cycles.rows };
}

export async function closeEquipmentCycle(client: Client, mainSerial: string) {
  await client.query('RESET ROLE');
  const { rows: warrantyCol } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'service_orders'
         AND column_name = 'warranty_profile'
     ) AS exists`
  );
  const warrantyClause = warrantyCol[0]?.exists
    ? `, warranty_profile = COALESCE(warranty_profile, 'listo')`
    : '';
  await client.query(
    `UPDATE public.service_orders
        SET status = 'DESPACHADO',
            closed_at = now()${warrantyClause}
      WHERE public.normalize_equipment_serial(main_serial) = public.normalize_equipment_serial($1)`,
    [mainSerial]
  );
  await client.query(
    `UPDATE public.series SET current_status = 'dispatched'
      WHERE service_order_id IN (
        SELECT id FROM public.service_orders
         WHERE public.normalize_equipment_serial(main_serial) = public.normalize_equipment_serial($1)
      )`,
    [mainSerial]
  );
}

export async function truncateClassifyTables(client: Client) {
  await client.query(
    'TRUNCATE public.service_order_serial_cycles, public.series, public.service_orders, public.sap_transfer_documents RESTART IDENTITY CASCADE'
  );
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timeout after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
