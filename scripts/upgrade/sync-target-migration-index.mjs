/**
 * Genera índice de migraciones del commit objetivo (para plan sin supabase/migrations en export).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { migrationVersionFromFilename } from './migration-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const metaPath = path.join(root, 'docs/changes/upgrade-recovery-a14b4ce/validation-package-meta.json');
const outPath = path.join(root, 'docs/changes/upgrade-recovery-a14b4ce/target-migration-index.json');

export function syncTargetMigrationIndex() {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const commit = meta.targetApplicationCommit;
  const out = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', commit, '--', 'supabase/migrations'],
    { cwd: root, encoding: 'utf8' }
  );
  const files = out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.sql'))
    .map((rel) => path.basename(rel))
    .sort((a, b) => a.localeCompare(b));

  const filesPayload = files.map((name) => ({ name, version: migrationVersionFromFilename(name) }));
  let generatedAtUtc = new Date().toISOString();
  if (fs.existsSync(outPath)) {
    const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const sameCommit = prev.targetApplicationCommit === commit;
    const sameFiles = JSON.stringify(prev.files ?? []) === JSON.stringify(filesPayload);
    if (sameCommit && sameFiles && prev.generatedAtUtc) {
      generatedAtUtc = prev.generatedAtUtc;
    }
  }
  const payload = {
    targetApplicationCommit: commit,
    generatedAtUtc,
    files: filesPayload,
  };
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload.files.length;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const n = syncTargetMigrationIndex();
  console.log(`Wrote ${outPath} (${n} migrations)`);
}
