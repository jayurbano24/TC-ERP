/**
 * Genera supabase/migrations/10990000000000_hr_legacy_attendance_bootstrap.sql
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const supabaseDir = path.join(root, 'supabase');
const outPath = path.join(supabaseDir, 'migrations', '10990000000000_hr_legacy_attendance_bootstrap.sql');

const sources = [
  'hr_legacy/000_hr_attendance_core.sql',
  '020_hr_module_phase1.sql',
  '021_hr_erp_enterprise_policies.sql',
  '022_hr_exact_timestamps.sql',
  '023_hr_module_robustness.sql',
  '../migration_v3.sql',
  '../migration_v4.sql',
  '../migration_v5.sql',
];

const header = `-- =============================================================================
-- 10990000000000 — Bootstrap HR / asistencia (fuentes fuera de migrations/)
-- Generado por scripts/assemble-hr-legacy-migration.mjs — no editar a mano.
-- Orden lex: después de 109_* y antes de 110_rls_cleanup (time_logs / employees).
-- =============================================================================

`;

/** @param {string} [projectRoot] */
export function buildHrLegacyBootstrapSql(projectRoot = root) {
  const base = path.join(projectRoot, 'supabase');
  const parts = [header];
  const digests = [];

  for (const rel of sources) {
    const resolved = rel.startsWith('../')
      ? path.join(projectRoot, rel.slice(3))
      : path.join(base, rel);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Missing HR bootstrap source: ${rel} (${resolved})`);
    }
    const body = fs.readFileSync(resolved, 'utf8');
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    digests.push({ rel, hash });
    parts.push(`\n-- >>> BEGIN ${rel} (sha256:${hash})\n`);
    parts.push(body);
    parts.push(`\n-- <<< END ${rel}\n`);
  }

  return { sql: parts.join(''), digests };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const { sql, digests } = buildHrLegacyBootstrapSql();
  fs.writeFileSync(outPath, sql);
  console.log('Wrote', outPath, sql.length, 'bytes');
  console.log('Source digests:', JSON.stringify(digests, null, 2));
}
