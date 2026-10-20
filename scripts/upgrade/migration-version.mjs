import fs from 'node:fs';

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
