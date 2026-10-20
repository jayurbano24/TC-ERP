/**
 * Falla si hay .sql en supabase/migrations con nombre inválido para Supabase CLI
 * (provocarían "Skipping migration …" en db reset).
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'supabase', 'migrations');

/** Mismo criterio que Supabase CLI: prefijo numérico + guion bajo + nombre. */
const VALID = /^\d+_[A-Za-z0-9_]+\.sql$/;

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
const invalid = files.filter((f) => !VALID.test(f));

if (invalid.length > 0) {
  console.error('Invalid migration filenames (would be skipped by Supabase CLI):');
  for (const f of invalid.sort()) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log(`Migration filenames OK (${files.length} files).`);
process.exit(0);
