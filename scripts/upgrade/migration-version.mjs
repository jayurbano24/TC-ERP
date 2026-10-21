import fs from 'node:fs';
import path from 'node:path';

/** @param {string} filename */
export function migrationVersionFromFilename(filename) {
  const base = filename.replace(/\.sql$/i, '');
  const idx = base.indexOf('_');
  if (idx <= 0) return base;
  return base.slice(0, idx);
}

/** @param {string} migrationsDir */
export function listTargetMigrationFilesSync(migrationsDir) {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      version: migrationVersionFromFilename(name),
    }));
}

/** @param {string} repoRoot */
export function listTargetMigrationFilesFromPackageIndex(repoRoot) {
  const indexPath = path.join(
    repoRoot,
    'docs/changes/upgrade-recovery-a14b4ce/target-migration-index.json'
  );
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Missing target-migration-index.json (run sync-target-migration-index.mjs)`);
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  return index.files ?? [];
}

/** Resolve target migration list: prefer index (export-safe), else scan disk. */
export function resolveTargetMigrationFiles(repoRoot, migrationsDir) {
  const indexPath = path.join(
    repoRoot,
    'docs/changes/upgrade-recovery-a14b4ce/target-migration-index.json'
  );
  if (fs.existsSync(indexPath)) {
    return listTargetMigrationFilesFromPackageIndex(repoRoot);
  }
  if (fs.existsSync(migrationsDir)) {
    return listTargetMigrationFilesSync(migrationsDir);
  }
  throw new Error('No target migrations source (index or supabase/migrations)');
}
