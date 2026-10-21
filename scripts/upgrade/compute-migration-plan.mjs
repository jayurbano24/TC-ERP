/**
 * Plan = target − historial restaurado. Solo `apply` es ejecutable por el runner.
 * skip_* en pendientes → BLOCK (CLI aún vería el archivo en migrations/).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { migrationVersionFromFilename, resolveTargetMigrationFiles } from './migration-version.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const migrationsDir = path.join(root, 'supabase/migrations');
const decisionsPath = path.join(root, 'docs/changes/upgrade-recovery-a14b4ce/migration-decisions.json');

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function computeMigrationPlan(historyPath, opts = {}) {
  const migrationsRoot = opts.migrationsDir ?? migrationsDir;
  if (!fs.existsSync(historyPath)) {
    throw new Error(`Missing restored migration history: ${historyPath}`);
  }
  const history = loadJson(historyPath);
  const backupManifestPath = history.sourceBackupManifest ?? history.backupManifestPath;
  const applied = new Set((history.versions ?? history.rows?.map((r) => r.version) ?? []).map(String));

  const target = resolveTargetMigrationFiles(root, migrationsRoot);
  const decisions = loadJson(
    opts.decisionsPath ?? path.join(root, 'docs/changes/upgrade-recovery-a14b4ce/migration-decisions.json')
  );

  const pending = target.filter((m) => !applied.has(m.version));
  const blocked = [];
  const toApply = [];

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
      blocked.push({
        ...m,
        reason: 'skip_while_pending_cli_would_apply',
        decision,
        note: 'Cannot skip while file remains in migrations/ without history manipulation',
      });
    } else if (decision === 'compensatory_manual') {
      blocked.push({ ...m, reason: 'compensatory_manual_required', decision });
    } else {
      blocked.push({ ...m, reason: 'unknown_decision', decision });
    }
  }

  const driftReview = [];
  for (const [file, meta] of Object.entries(decisions.contentChangedWhenAlreadyApplied ?? {})) {
    const version = migrationVersionFromFilename(file);
    if (applied.has(version)) {
      driftReview.push({ file, version, decision: meta.decision, compensatory: meta.compensatory ?? null });
    }
  }

  const versionList = [...applied].sort();
  const restoredVersionsKey = crypto
    .createHash('sha256')
    .update(versionList.join('|'))
    .digest('hex');

  const approvedPlan = {
    targetApplicationCommit: 'a14b4ce22a6d53514fd69392c3b32e7016d00e5e',
    sourceBackupManifest: backupManifestPath ?? null,
    restoredHistoryPath: historyPath,
    restoredVersionsKey,
    restoredVersions: versionList,
    toApply: toApply.map((m) => m.name),
    blocked: blocked.map((b) => b.name),
    generatedAtUtc: new Date().toISOString(),
  };

  return {
    pending,
    toApply,
    blocked,
    driftReview,
    appliedCount: applied.size,
    targetCount: target.length,
    approvedPlan,
  };
}

export function writeApprovedPlan(plan, outPath) {
  fs.writeFileSync(outPath, `${JSON.stringify(plan.approvedPlan, null, 2)}\n`, 'utf8');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (isMain) {
  const historyPath = process.argv[2];
  const outPlan = process.argv[3];
  if (!historyPath) {
    console.error('Usage: node compute-migration-plan.mjs <restored-history.json> [approved-plan.json]');
    process.exit(2);
  }
  const plan = computeMigrationPlan(historyPath);
  console.log(JSON.stringify(plan, null, 2));
  if (outPlan) writeApprovedPlan(plan, outPlan);
  if (plan.blocked.length > 0) {
    console.error(`BLOCKED: ${plan.blocked.length} migration(s).`);
    process.exit(1);
  }
  process.exit(0);
}
