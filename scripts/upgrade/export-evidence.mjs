/**
 * Exporta fingerprint JSON inmutable por fase (before|after|recovered).
 * Requiere UPGRADE_DATABASE_URL validado (54342).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const QUERIES = {
  counts: `
    SELECT json_build_object(
      'service_orders', (SELECT COUNT(*) FROM public.service_orders),
      'service_orders_open', (SELECT COUNT(*) FROM public.service_orders WHERE closed_at IS NULL),
      'service_orders_closed', (SELECT COUNT(*) FROM public.service_orders WHERE closed_at IS NOT NULL),
      'series', (SELECT COUNT(*) FROM public.series),
      'cycles_total', (SELECT COUNT(*) FROM public.service_order_serial_cycles),
      'cycles_open', (SELECT COUNT(*) FROM public.service_order_serial_cycles WHERE unlinked_at IS NULL),
      'cycles_closed', (SELECT COUNT(*) FROM public.service_order_serial_cycles WHERE unlinked_at IS NOT NULL)
    ) AS v;
  `,
  identity_fingerprint: `
    SELECT md5(string_agg(row_sig, '|' ORDER BY row_sig)) AS fp
    FROM (
      SELECT md5(concat_ws(':',
        so.id::text, so.main_serial, so.status,
        coalesce(so.closed_at::text, ''),
        s.id::text, s.serial_number, s.status
      )) AS row_sig
      FROM public.service_orders so
      JOIN public.series s ON s.service_order_id = so.id
      WHERE so.closed_at IS NULL
      LIMIT 5000
    ) t;
  `,
  cycle_fingerprint: `
    SELECT md5(string_agg(row_sig, '|' ORDER BY row_sig)) AS fp
    FROM (
      SELECT md5(concat_ws(':',
        serial_number, service_order_id::text, cycle_no::text,
        coalesce(linked_at::text,''), coalesce(unlinked_at::text,'')
      )) AS row_sig
      FROM public.service_order_serial_cycles
      LIMIT 10000
    ) t;
  `,
  fk_orphans: `
    SELECT json_build_object(
      'series_without_os', (SELECT COUNT(*) FROM public.series s WHERE s.service_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.service_orders so WHERE so.id = s.service_order_id)),
      'cycles_without_os', (SELECT COUNT(*) FROM public.service_order_serial_cycles c WHERE NOT EXISTS (SELECT 1 FROM public.service_orders so WHERE so.id = c.service_order_id))
    ) AS v;
  `,
  classify_routines: `
    SELECT json_agg(json_build_object(
      'name', p.proname,
      'args', pg_get_function_identity_arguments(p.oid),
      'secdef', p.prosecdef
    ) ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)) AS v
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'classify_equipment_batch_tx','normalize_equipment_serial','series_active_service_order'
    );
  `,
  rls_policies: `
    SELECT md5(string_agg(line, E'\\n' ORDER BY line)) AS fp
    FROM (
      SELECT concat(schemaname,'.',tablename,'|',policyname,'|',cmd,'|',coalesce(qual,''),'|',coalesce(with_check,'')) AS line
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('series','service_orders','activity_costs','domain_events','service_order_serial_cycles')
    ) t;
  `,
  grants_classify: `
    SELECT json_agg(json_build_object(
      'grantee', grantee, 'privilege', privilege_type
    ) ORDER BY grantee, privilege_type) AS v
    FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public' AND routine_name = 'classify_equipment_batch_tx';
  `,
};

function assertUpgradeDbUrl(url) {
  if (!url) throw new Error('UPGRADE_DATABASE_URL required');
  if (/54322|54332/.test(url)) throw new Error('Forbidden port in UPGRADE_DATABASE_URL');
  if (!/54342/.test(url)) throw new Error('UPGRADE_DATABASE_URL must use port 54342');
}

export async function exportEvidencePhase(phase, outDir) {
  const dbUrl = process.env.UPGRADE_DATABASE_URL;
  assertUpgradeDbUrl(dbUrl);
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const payload = {
      phase,
      capturedAtUtc: new Date().toISOString(),
      dbUrlRedacted: dbUrl.replace(/:[^:@]+@/, ':***@'),
      fingerprints: {},
    };
    for (const [key, sql] of Object.entries(QUERIES)) {
      const { rows } = await client.query(sql);
      payload.fingerprints[key] = rows[0]?.v ?? rows[0]?.fp ?? null;
    }
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${phase}.json`);
    const tmp = `${outPath}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, outPath);
    return outPath;
  } finally {
    await client.end();
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const phase = process.argv[2];
  const outDir = process.argv[3];
  if (!phase || !outDir) {
    console.error('Usage: node export-evidence.mjs <before|after|recovered> <outDir>');
    process.exit(2);
  }
  exportEvidencePhase(phase, outDir)
    .then((p) => {
      console.log(`Wrote ${p}`);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
