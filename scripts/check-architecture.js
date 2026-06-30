/**
 * Fase A — Lint arquitectónico (ARCH-01 / ARCH-02)
 *
 * Uso:
 *   node scripts/check-architecture.js          — reporta; falla si hay violaciones nuevas
 *   node scripts/check-architecture.js --strict   — falla en cualquier violación
 *
 * Reglas:
 *   ARCH-01 ERROR: erp UI y hooks no importan lib/database
 *   ARCH-01 WARN:  API routes legacy en transición
 *   ARCH-02 ERROR: domain layer no importa supabase-js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const BASELINE_PATH = path.join(ROOT, 'scripts', '.architecture-baseline.json');

const LIB_DB_PATTERNS = [
  /from\s+['"]@\/lib\/database/,
  /from\s+['"]@\/lib\/database\//,
  /require\s*\(\s*['"]@\/lib\/database/,
];

const SUPABASE_IN_DOMAIN = /from\s+['"]@supabase\/supabase-js['"]/;

const EXTENSIONS = new Set(['.ts', '.tsx']);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full, files);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function classify(file) {
  const r = rel(file);
  if (r.includes('/domain/') && r.startsWith('src/modules/')) return 'domain';
  if (r.includes('/hooks/')) return 'hooks';
  if (r.startsWith('src/app/api/')) return 'api';
  if (r.startsWith('src/app/(erp)/')) return 'erp-ui';
  if (r.startsWith('src/components/')) return 'components';
  return 'other';
}

function scan() {
  const violations = [];
  for (const file of walk(SRC)) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    const kind = classify(file);

    lines.forEach((line, idx) => {
      if (LIB_DB_PATTERNS.some((p) => p.test(line))) {
        const severity =
          kind === 'erp-ui' || kind === 'hooks' ? 'error' :
          kind === 'api' || kind === 'components' ? 'warn' : 'info';
        violations.push({
          rule: 'ARCH-01',
          severity,
          file: rel(file),
          line: idx + 1,
          kind,
          snippet: line.trim().slice(0, 120),
        });
      }
      if (kind === 'domain' && SUPABASE_IN_DOMAIN.test(line)) {
        violations.push({
          rule: 'ARCH-02',
          severity: 'error',
          file: rel(file),
          line: idx + 1,
          kind,
          snippet: line.trim().slice(0, 120),
        });
      }
    });
  }
  return violations;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { allowed: [] };
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

function violationKey(v) {
  // Clave insensible a la línea: usa el texto del import en vez del número
  // de línea, para que mover código no rompa el CI con deuda ya conocida.
  // Un import genuinamente nuevo (snippet distinto) sí se detecta como NEW.
  return `${v.file}:${v.rule}:${v.snippet}`;
}

function main() {
  const strict = process.argv.includes('--strict');
  const updateBaseline = process.argv.includes('--update-baseline');
  const violations = scan();
  const errors = violations.filter((v) => v.severity === 'error');
  const warns = violations.filter((v) => v.severity === 'warn');

  console.log('=== TC-ERP Architecture Lint (Fase A) ===\n');
  console.log(`ARCH-01/02 scanned ${walk(SRC).length} files`);
  console.log(`Errors: ${errors.length} | Warnings: ${warns.length}\n`);

  if (errors.length) {
    console.log('--- ERRORS (ARCH-01 hooks / erp-ui, ARCH-02 domain) ---');
    errors.slice(0, 40).forEach((v) => {
      console.log(`  [${v.rule}] ${v.file}:${v.line} — ${v.snippet}`);
    });
    if (errors.length > 40) console.log(`  ... +${errors.length - 40} more`);
    console.log('');
  }

  if (warns.length) {
    console.log('--- WARNINGS (api/components legacy — migrar en Fase C) ---');
    warns.slice(0, 15).forEach((v) => {
      console.log(`  [${v.rule}] ${v.file}:${v.line}`);
    });
    if (warns.length > 15) console.log(`  ... +${warns.length - 15} more`);
    console.log('');
  }

  const baseline = loadBaseline();
  const allowed = new Set(baseline.allowed || []);
  const currentErrorKeys = new Set(errors.map(violationKey));
  const newErrors = errors.filter((v) => !allowed.has(violationKey(v)));

  if (updateBaseline) {
    const payload = {
      updatedAt: new Date().toISOString(),
      allowed: errors.map(violationKey),
      note: 'Grandfathered ARCH-01 errors; CI fails on NEW violations only.',
    };
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2));
    console.log(`Baseline updated: ${payload.allowed.length} grandfathered errors → ${BASELINE_PATH}\n`);
    process.exit(0);
  }

  if (strict && errors.length > 0) {
    console.error(`FAIL (--strict): ${errors.length} architecture error(s).`);
    process.exit(1);
  }

  if (newErrors.length > 0) {
    console.error(`FAIL: ${newErrors.length} NEW architecture error(s) not in baseline.`);
    newErrors.forEach((v) => console.error(`  NEW ${v.file}:${v.line}`));
    console.error('\nFix imports or run: node scripts/check-architecture.js --update-baseline (solo si es deuda conocida).');
    process.exit(1);
  }

  if (errors.length > 0) {
    console.log(`OK: ${errors.length} grandfathered error(s); 0 new violations.\n`);
  } else {
    console.log('OK: no ARCH errors.\n');
  }

  process.exit(0);
}

main();
