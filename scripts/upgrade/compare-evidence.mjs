import fs from 'node:fs';
import path from 'node:path';

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * @param {string} evidenceDir
 */
export function compareEvidence(evidenceDir) {
  const beforePath = path.join(evidenceDir, 'before.json');
  const afterPath = path.join(evidenceDir, 'after.json');
  const recoveredPath = path.join(evidenceDir, 'recovered.json');
  const deltasPath = path.join(
    path.resolve(import.meta.dirname, '../..'),
    'docs/changes/upgrade-recovery-a14b4ce/expected-after-deltas.json'
  );
  const anomaliesPath = path.join(evidenceDir, 'pre-existing-anomalies.json');

  if (!fs.existsSync(beforePath)) throw new Error(`Missing ${beforePath}`);
  const before = loadJson(beforePath);
  const errors = [];

  if (fs.existsSync(anomaliesPath)) {
    const anomalies = loadJson(anomaliesPath);
    before.registeredAnomalies = anomalies;
  }

  if (fs.existsSync(afterPath)) {
    const after = loadJson(afterPath);
    const allowed = fs.existsSync(deltasPath) ? loadJson(deltasPath) : { allowedFingerprintKeys: [] };
    for (const key of Object.keys(before.fingerprints)) {
      if (key === allowed.countsKeyToComparePartially) continue;
      const b = before.fingerprints[key];
      const a = after.fingerprints[key];
      const explicit = allowed.explicitChanges?.[key];
      if (explicit) {
        if (!deepEqual(a, explicit.expectedAfter)) {
          errors.push(`after.${key}: does not match explicit expected-after delta`);
        }
        continue;
      }
      if (allowed.allowedFingerprintKeys.includes(key)) {
        if (deepEqual(a, b)) {
          errors.push(`after.${key}: expected change but fingerprint unchanged`);
        }
        continue;
      }
      if (!deepEqual(a, b)) {
        errors.push(`after.${key}: unexpected change vs before`);
      }
    }
  }

  if (fs.existsSync(recoveredPath)) {
    const recovered = loadJson(recoveredPath);
    for (const key of Object.keys(before.fingerprints)) {
      if (!deepEqual(recovered.fingerprints[key], before.fingerprints[key])) {
        errors.push(`recovered.${key}: must match restorable before state`);
      }
    }
  }

  if (errors.length) {
    const err = new Error(`Evidence comparison failed:\n${errors.join('\n')}`);
    err.details = errors;
    throw err;
  }
  return { ok: true };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
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
