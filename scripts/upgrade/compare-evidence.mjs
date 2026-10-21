import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function idSet(evidence, key) {
  return new Set(evidence?.[key]?.ids ?? []);
}

function fp(evidence, key) {
  return evidence?.[key]?.fingerprint ?? null;
}

/**
 * @param {string} evidenceDir
 */
export function compareEvidence(evidenceDir) {
  const beforePath = path.join(evidenceDir, 'before.json');
  if (!fs.existsSync(beforePath)) throw new Error(`Missing ${beforePath}`);

  const before = loadJson(beforePath);
  const b = before.evidence ?? before.fingerprints;
  const errors = [];
  const deltasPath = path.join(moduleDir, '../../docs/changes/upgrade-recovery-a14b4ce/expected-after-deltas.json');
  const allowed = fs.existsSync(deltasPath) ? loadJson(deltasPath) : { allowedChangedKeys: [] };

  const comparePhase = (phaseFile, mode) => {
    const p = path.join(evidenceDir, phaseFile);
    if (!fs.existsSync(p)) return;
    const after = loadJson(p);
    const a = after.evidence ?? after.fingerprints;

    for (const key of ['serviceOrderIds', 'seriesIds', 'identity', 'cycles']) {
      const bf = fp(b, key);
      const af = fp(a, key);
      if (mode === 'recovered') {
        if (bf !== af) errors.push(`${phaseFile}: ${key} fingerprint must match before`);
        const bs = idSet(b, key);
        const as = idSet(a, key);
        if (bs.size !== as.size || [...bs].some((id) => !as.has(id))) {
          errors.push(`${phaseFile}: ${key} id set must match before`);
        }
        continue;
      }
      if (mode === 'after') {
        if (allowed.allowedChangedKeys?.includes(key)) {
          if (bf === af && idSet(b, key).size === idSet(a, key).size) {
            const bs = idSet(b, key);
            const as = idSet(a, key);
            if ([...bs].every((id) => as.has(id)) && bs.size === as.size) {
              errors.push(`after: ${key} expected change but identical`);
            }
          }
          continue;
        }
        if (bf !== af) errors.push(`after: unexpected ${key} fingerprint change`);
        const bs = idSet(b, key);
        const as = idSet(a, key);
        if (bs.size === as.size && [...bs].some((id) => !as.has(id))) {
          errors.push(`after: ${key} count stable but id set changed (silent data swap)`);
        }
      }
    }

    const fpKeys = [
      'rls_policies',
      'grants_classify',
      'sequences',
      'routines_public',
      'table_owners',
    ];
    for (const key of fpKeys) {
      if (mode === 'after' && allowed.allowedChangedKeys?.includes(key)) continue;
      if (mode === 'recovered' && fp(b, key) !== fp(a, key)) {
        errors.push(`${phaseFile}: ${key} must match before`);
      }
      if (mode === 'after' && fp(b, key) !== fp(a, key) && !allowed.allowedChangedKeys?.includes(key)) {
        errors.push(`after: unexpected ${key} change`);
      }
    }

    if (mode === 'after' && b.counts && a.counts) {
      for (const [table, beforeCount] of Object.entries(b.counts)) {
        const afterCount = a.counts[table];
        if (afterCount === undefined) continue;
        if (String(beforeCount) !== String(afterCount)) {
          const idKey =
            table === 'service_orders'
              ? 'serviceOrderIds'
              : table === 'series'
                ? 'seriesIds'
                : null;
          if (!idKey || !allowed.allowedChangedKeys?.includes(idKey)) {
            errors.push(`after: row count change ${table} ${beforeCount} -> ${afterCount}`);
          }
        }
      }
    }
  };

  comparePhase('after.json', 'after');
  comparePhase('recovered.json', 'recovered');

  if (errors.length) {
    throw new Error(`Evidence comparison failed:\n${errors.join('\n')}`);
  }
  return { ok: true };
}

/** Unit helper: detect same count, different ids */
export function detectSilentSwap(beforeIds, afterIds) {
  const b = new Set(beforeIds);
  const a = new Set(afterIds);
  return b.size === a.size && [...b].some((id) => !a.has(id));
}

const isMain = process.argv[1]?.endsWith('compare-evidence.mjs');
if (isMain) {
  try {
    compareEvidence(process.argv[2]);
    console.log('Evidence comparison OK');
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
