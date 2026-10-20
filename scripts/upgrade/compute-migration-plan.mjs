/**
 * Plan real: migraciones target (a14b4ce) − historial restaurado.
 * Bloquea pendientes sin decisión explícita distinta de block (salvo apply/skip_*).
 */
import fs from 'node:fs';
import path from 'node:path';
import { listTargetMigrationFilesSync, migrationVersionFromFilename } from './migration-version.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const migrationsDir = path.join(root, 'supabase/migrations');
const decisionsPath = path.join(
  root,
  'docs/changes/upgrade-recovery-a14b4ce/migration-decisions.json'
);

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * @param {string} historyPath JSON { "versions": ["177", ...], "rows": [{version,name}] }
 */
export function computeMigrationPlan(historyPath) {
  if (!fs.existsSync(historyPath)) {
    throw new Error(`Missing restored migration history: ${historyPath}`);
  }
  const history = loadJson(historyPath);
  const applied = new Set((history.versions ?? history.rows?.map((r) => r.version) ?? []).map(String));

  const target = listTargetMigrationFilesSync(migrationsDir);
  const decisions = loadJson(decisionsPath);

  const pending = target.filter((m) => !applied.has(m.version));
  const blocked = [];
  const toApply = [];
  const skipped = [];

  for (const m of pending) {
    const d = decisions.migrations[m.version];
    if (!d) {
      blocked.push({ ...m, reason: 'no_decision_record' });
      continue;
    }
    const decision = d.decision;
    if (decision === 'block' || d.defaultUntilCopyReviewed) {
      blocked.push({ ...m, reason: 'decision_block', decision });
    } else if (decision === 'apply') {
      toApply.push(m);
    } else if (decision === 'skip_equivalent' || decision === 'skip_accept_existing') {
      skipped.push({ ...m, decision });
    } else if (decision === 'compensatory_manual') {
      blocked.push({ ...m, reason: 'compensatory_manual_required', decision });
    } else {
      blocked.push({ ...m, reason: 'unknown_decision', decision });
    }
  }

  // Already applied but content changed in Git
  const driftReview = [];
  for (const [file, meta] of Object.entries(decisions.contentChangedWhenAlreadyApplied ?? {})) {
    const version = migrationVersionFromFilename(file);
    if (applied.has(version)) {
      driftReview.push({ file, version, decision: meta.decision, compensatory: meta.compensatory ?? null });
    }
  }

  return { pending, toApply, skipped, blocked, driftReview, appliedCount: applied.size, targetCount: target.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (isMain) {
  const historyPath = process.argv[2];
  if (!historyPath) {
    console.error('Usage: node compute-migration-plan.mjs <restored-schema_migrations.json>');
    process.exit(2);
  }
  const plan = computeMigrationPlan(historyPath);
  console.log(JSON.stringify(plan, null, 2));
  if (plan.blocked.length > 0) {
    console.error(`BLOCKED: ${plan.blocked.length} migration(s) require explicit decision before upgrade.`);
    process.exit(1);
  }
  process.exit(0);
}
