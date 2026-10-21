import fs from 'node:fs';
import path from 'node:path';
import { computeMigrationPlan } from './compute-migration-plan.mjs';

/**
 * Revalida historial restaurado vs plan aprobado inmediatamente antes de migrar.
 */
export function validatePlanBeforeMigrate(restoredHistoryPath, approvedPlanPath) {
  const fresh = computeMigrationPlan(restoredHistoryPath);
  const approved = JSON.parse(fs.readFileSync(approvedPlanPath, 'utf8'));
  const history = JSON.parse(fs.readFileSync(restoredHistoryPath, 'utf8'));

  const errors = [];
  if (approved.restoredHistoryPath && path.resolve(approved.restoredHistoryPath) !== path.resolve(restoredHistoryPath)) {
    errors.push('restoredHistoryPath mismatch');
  }
  if (approved.restoredVersionsKey && approved.restoredVersionsKey !== fresh.approvedPlan.restoredVersionsKey) {
    errors.push('restored migration history changed since plan approval');
  }
  const liveVersions = [...(history.versions ?? history.rows?.map((r) => String(r.version)) ?? [])].sort().join('|');
  const approvedVersions = [...(approved.restoredVersions ?? [])].sort().join('|');
  if (approved.restoredVersions?.length && approvedVersions !== liveVersions) {
    errors.push('restored history file versions differ from approved snapshot');
  }
  if (approved.targetApplicationCommit !== fresh.approvedPlan.targetApplicationCommit) {
    errors.push('targetApplicationCommit mismatch');
  }
  const a = [...(approved.toApply ?? [])].sort().join('|');
  const b = [...(fresh.approvedPlan.toApply ?? [])].sort().join('|');
  if (a !== b) {
    errors.push('toApply list changed since plan approval');
  }
  if (fresh.blocked.length > 0) {
    errors.push(`blocked migrations present: ${fresh.blocked.map((x) => x.name).join(', ')}`);
  }
  if (approved.sourceBackupManifest && fresh.approvedPlan.sourceBackupManifest) {
    if (approved.sourceBackupManifest !== fresh.approvedPlan.sourceBackupManifest) {
      errors.push('sourceBackupManifest mismatch');
    }
  }
  if (errors.length) {
    throw new Error(`Plan revalidation failed:\n${errors.join('\n')}`);
  }
  return fresh;
}

const isMain = import.meta.url.endsWith('validate-plan-before-migrate.mjs') && process.argv[1]?.includes('validate-plan-before-migrate');
if (process.argv[1]?.endsWith('validate-plan-before-migrate.mjs')) {
  try {
    validatePlanBeforeMigrate(process.argv[2], process.argv[3]);
    console.log('Plan revalidation OK');
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
