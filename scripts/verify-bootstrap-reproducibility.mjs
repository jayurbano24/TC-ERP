/**
 * Verificación de solo lectura: ensambla en memoria y compara con el artefacto versionado.
 * No modifica supabase/migrations/*.sql ni ejecuta ensambladores de escritura.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildErpLegacyBootstrapSql } from './assemble-erp-bootstrap-migration.mjs';
import { buildHrLegacyBootstrapSql } from './assemble-hr-legacy-migration.mjs';

const root = path.resolve(import.meta.dirname, '..');

function sha256Text(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function sha256File(filePath) {
  return sha256Text(fs.readFileSync(filePath, 'utf8'));
}

const targets = [
  {
    name: '014_erp_legacy_bootstrap.sql',
    committed: path.join(root, 'supabase/migrations/014_erp_legacy_bootstrap.sql'),
    build: () => buildErpLegacyBootstrapSql(root),
  },
  {
    name: '10990000000000_hr_legacy_attendance_bootstrap.sql',
    committed: path.join(root, 'supabase/migrations/10990000000000_hr_legacy_attendance_bootstrap.sql'),
    build: () => buildHrLegacyBootstrapSql(root).sql,
  },
];

let failed = false;
for (const { name, committed, build } of targets) {
  if (!fs.existsSync(committed)) {
    console.error(`${name}: MISSING committed artifact at ${committed}`);
    failed = true;
    continue;
  }
  const onDiskBefore = sha256File(committed);
  const gen1 = build();
  const gen2 = build();
  const hGen1 = sha256Text(gen1);
  const hGen2 = sha256Text(gen2);
  const onDiskAfter = sha256File(committed);

  const reproducible = hGen1 === hGen2;
  const matchesCommitted = hGen1 === onDiskBefore;
  const diskUntouched = onDiskBefore === onDiskAfter;

  const ok = reproducible && matchesCommitted && diskUntouched;
  console.log(
    `${name}: ${ok ? 'OK' : 'FAIL'} committed=${onDiskBefore} memory=${hGen1} reproducible=${reproducible} diskUntouched=${diskUntouched}`
  );
  if (!ok) failed = true;
}

process.exit(failed ? 1 : 0);
