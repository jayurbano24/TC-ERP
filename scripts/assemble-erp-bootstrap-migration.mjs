/**
 * Genera supabase/migrations/014_erp_legacy_bootstrap.sql
 * a partir de los SQL legacy en supabase/ (fuera de migrations/) + fragmento technologies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const supabaseDir = path.join(root, 'supabase');
const outPath = path.join(supabaseDir, 'migrations', '014_erp_legacy_bootstrap.sql');

const legacyFiles = ['001_initial_schema.sql'];

const bridgeFragments = ['bootstrap_fragments/002_service_orders_shape_bridge.sql'];

const legacyFilesAfterBridge = [
  '006_add_status_to_receptions.sql',
  '007_clients_agencies_policies.sql',
  '008_fix_clients_seed_and_receptor_access.sql',
  '009_add_agency_metadata.sql',
  '010_create_service_orders.sql',
  '011_audit_logs_policies.sql',
  '012_carriers_schema.sql',
  '013_diagnostics_repairs_schema.sql',
  '014_diagnostics_rls.sql',
  '015_reacondicionado_tests_schema.sql',
  '016_user_kpis.sql',
  '017_px_providers.sql',
  '018_box_code_sequence.sql',
  '019_os_code_sequence.sql',
];

const fragments = ['bootstrap_fragments/001_technologies_catalog.sql'];

function readSourceSql(abs) {
  return fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
}

const header = `-- =============================================================================
-- 014 — Bootstrap legacy ERP (001–019 fuera de migrations/)
-- Generado por scripts/assemble-erp-bootstrap-migration.mjs — no editar a mano.
-- Idempotente (IF NOT EXISTS / duplicate_object). Compatible con bases que ya
-- ejecutaron estos scripts en el SQL Editor.
-- =============================================================================

`;

/** @param {string} [projectRoot] */
export function buildErpLegacyBootstrapSql(projectRoot = root) {
  const base = path.join(projectRoot, 'supabase');
  const parts = [header];

  for (const rel of legacyFiles) {
    const abs = path.join(base, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`Missing legacy bootstrap source: ${rel}`);
    }
    parts.push(`\n-- >>> BEGIN ${rel}\n`);
    parts.push(readSourceSql(abs));
    parts.push(`\n-- <<< END ${rel}\n`);
  }

  for (const rel of bridgeFragments) {
    const abs = path.join(base, rel);
    parts.push(`\n-- >>> BEGIN ${rel}\n`);
    parts.push(readSourceSql(abs));
    parts.push(`\n-- <<< END ${rel}\n`);
  }

  for (const rel of legacyFilesAfterBridge) {
    const abs = path.join(base, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`Missing legacy bootstrap source: ${rel}`);
    }
    parts.push(`\n-- >>> BEGIN ${rel}\n`);
    parts.push(readSourceSql(abs));
    parts.push(`\n-- <<< END ${rel}\n`);
  }

  for (const rel of fragments) {
    const abs = path.join(base, rel);
    parts.push(`\n-- >>> BEGIN ${rel}\n`);
    parts.push(readSourceSql(abs));
    parts.push(`\n-- <<< END ${rel}\n`);
  }

  return parts.join('');
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const out = buildErpLegacyBootstrapSql();
  fs.writeFileSync(outPath, out);
  console.log('Wrote', outPath, out.length, 'bytes');
}
