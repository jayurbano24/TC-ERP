/**
 * Aplica SOLO migraciones listadas en approved-plan.json (vía supabase migration up
 * con carpeta staging). No ejecutar supabase db reset.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validatePlanBeforeMigrate } from './validate-plan-before-migrate.mjs';

const root = path.resolve(import.meta.dirname, '../..');

export function buildMigrationStaging(approvedPlanPath, stagingDir) {
  const approved = JSON.parse(fs.readFileSync(approvedPlanPath, 'utf8'));
  const srcMigrations = path.join(root, 'supabase/migrations');
  fs.mkdirSync(stagingDir, { recursive: true });
  for (const name of approved.toApply ?? []) {
    const src = path.join(srcMigrations, name);
    if (!fs.existsSync(src)) throw new Error(`Missing migration source: ${name}`);
    fs.copyFileSync(src, path.join(stagingDir, name));
  }
  return approved.toApply ?? [];
}

export function assertRunnerMatchesPlan(approvedPlanPath, migrationsDir) {
  const approved = new Set(JSON.parse(fs.readFileSync(approvedPlanPath, 'utf8')).toApply ?? []);
  const onDisk = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  const extra = onDisk.filter((f) => !approved.has(f));
  if (extra.length) {
    throw new Error(`Runner folder contains migrations outside approved plan: ${extra.join(', ')}`);
  }
}

const isMain = process.argv[1]?.endsWith('run-approved-migrations.mjs');
if (isMain) {
  const historyPath = process.argv[2];
  const approvedPlanPath = process.argv[3];
  const stagingDir = process.argv[4] ?? path.join(root, '.upgrade-migrations-staging');
  if (!historyPath || !approvedPlanPath) {
    console.error('Usage: node run-approved-migrations.mjs <history.json> <approved-plan.json> [stagingDir]');
    process.exit(2);
  }
  validatePlanBeforeMigrate(historyPath, approvedPlanPath);
  const list = buildMigrationStaging(approvedPlanPath, stagingDir);
  assertRunnerMatchesPlan(approvedPlanPath, stagingDir);
  console.log(`Staging ready (${list.length} files) at ${stagingDir}`);
  console.log('Next: junction workdir migrations to stagingDir, then supabase migration up --local');
  process.exit(0);
}
