import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareEvidence, detectSilentSwap } from './compare-evidence.mjs';
import { computeMigrationPlan } from './compute-migration-plan.mjs';
import { validateBackupManifest } from './validate-backup-artifact.mjs';
import { validatePlanBeforeMigrate } from './validate-plan-before-migrate.mjs';
import { assertRunnerMatchesPlan } from './run-approved-migrations.mjs';
import { verifyPackageManifestFromExport } from './verify-package-manifest.mjs';
import { compareInventories } from './object-inventory.mjs';
import { assertUpgradeDbUrl } from './export-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtures = path.join(root, 'docs/changes/upgrade-recovery-a14b4ce/fixtures');

function evidencePayload(overrides = {}) {
  const base = {
    serviceOrderIds: { fingerprint: 'so-fp', count: 2, ids: ['a', 'b'] },
    seriesIds: { fingerprint: 'se-fp', count: 2, ids: ['s1', 's2'] },
    identity: { fingerprint: 'id-fp', count: 2, ids: ['a:s1', 'b:s2'] },
    cycles: { fingerprint: 'cy-fp', count: 1, ids: ['x|a|1||'] },
    rls_policies: { fingerprint: 'rls-fp', count: 3 },
    grants_classify: { fingerprint: 'gr-fp', count: 1 },
    sequences: { fingerprint: 'seq-fp', count: 1 },
    routines_public: { fingerprint: 'rt-fp', count: 1 },
    table_owners: { fingerprint: 'own-fp', count: 1 },
    counts: { service_orders: 2, series: 2, cycles: 1 },
  };
  return { evidence: { ...base, ...overrides } };
}

describe('upgrade validation package (non-destructive)', () => {
  it('rejects backup manifest with wrong sha256', () => {
    const bad = path.join(fixtures, 'manifest-bad-sha.json');
    expect(() => validateBackupManifest(bad, { cwd: root })).toThrow(/SHA-256 mismatch/);
  });

  it('rejects backup manifest with placeholder hash', () => {
    const ph = path.join(fixtures, 'manifest-placeholder.json');
    expect(() => validateBackupManifest(ph, { cwd: root })).toThrow(/SHA-256 not finalized/);
  });

  it('accepts valid fixture manifest (export bytes)', () => {
    const ok = path.join(fixtures, 'manifest-valid.json');
    expect(() => validateBackupManifest(ok, { cwd: root })).not.toThrow();
  });

  it('rejects incomplete backup manifest (missing required fields)', () => {
    const inc = path.join(fixtures, 'manifest-incomplete.json');
    expect(() => validateBackupManifest(inc, { cwd: root })).toThrow(/Missing required field/);
  });

  it('rejects multi-dump manifest without restoreOrder', () => {
    const multi = path.join(fixtures, 'manifest-multi-no-order.json');
    expect(() => validateBackupManifest(multi, { cwd: root })).toThrow(/restoreOrder/);
  });

  it('rejects automated anonymization certification', () => {
    const tmp = path.join(os.tmpdir(), `manifest-anon-${Date.now()}.json`);
    const base = JSON.parse(fs.readFileSync(path.join(fixtures, 'manifest-placeholder.json'), 'utf8'));
    base.automatedChecks.anonymizationVerified = true;
    fs.writeFileSync(tmp, JSON.stringify(base));
    expect(() => validateBackupManifest(tmp, { cwd: root, allowPlaceholder: true })).toThrow(
      /anonymizationVerified/
    );
  });

  it('blocks migration plan when 014/109900 default block', () => {
    const history = path.join(fixtures, 'restored-history-pre-a14b4ce.json');
    const plan = computeMigrationPlan(history);
    expect(plan.blocked.some((b) => b.version === '014' || b.version === '10990000000000')).toBe(true);
  });

  it('blocks skip_equivalent while CLI would apply pending file', () => {
    const history = path.join(fixtures, 'restored-history-skip-equivalent.json');
    const decisionsPath = path.join(root, 'docs/changes/upgrade-recovery-a14b4ce/migration-decisions.json');
    const decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
    const tmpDecisions = path.join(os.tmpdir(), `decisions-skip-${Date.now()}.json`);
    decisions.migrations['01600000000000'] = {
      file: '01600000000000_activity_costs.sql',
      decision: 'skip_equivalent',
    };
    fs.writeFileSync(tmpDecisions, JSON.stringify(decisions));
    const plan = computeMigrationPlan(history, { decisionsPath: tmpDecisions });
    expect(plan.blocked.some((b) => b.reason === 'skip_while_pending_cli_would_apply')).toBe(true);
  });

  it('rejects runner folder with migration outside approved plan', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-erp-staging-'));
    const planPath = path.join(dir, 'plan.json');
    fs.writeFileSync(planPath, JSON.stringify({ toApply: ['001_only.sql'] }));
    fs.writeFileSync(path.join(dir, '001_only.sql'), '-- ok');
    fs.writeFileSync(path.join(dir, '999_extra.sql'), '-- bad');
    expect(() => assertRunnerMatchesPlan(planPath, dir)).toThrow(/outside approved plan/);
  });

  it('fails compare on unexpected after diff', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-erp-evidence-'));
    fs.writeFileSync(path.join(dir, 'before.json'), JSON.stringify(evidencePayload()));
    fs.writeFileSync(
      path.join(dir, 'after.json'),
      JSON.stringify(evidencePayload({ identity: { fingerprint: 'changed', count: 2, ids: ['a:s1', 'b:s2'] } }))
    );
    expect(() => compareEvidence(dir)).toThrow(/unexpected identity/);
  });

  it('detects silent swap (same count, different ids)', () => {
    expect(detectSilentSwap(['a', 'b'], ['a', 'c'])).toBe(true);
    expect(detectSilentSwap(['a', 'b'], ['a', 'b'])).toBe(false);
  });

  it('fails after when count stable but ids swapped', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-erp-evidence-'));
    fs.writeFileSync(
      path.join(dir, 'before.json'),
      JSON.stringify(evidencePayload({ serviceOrderIds: { fingerprint: 'fp1', count: 2, ids: ['a', 'b'] } }))
    );
    fs.writeFileSync(
      path.join(dir, 'after.json'),
      JSON.stringify(
        evidencePayload({
          serviceOrderIds: { fingerprint: 'fp2', count: 2, ids: ['a', 'c'] },
        })
      )
    );
    expect(() => compareEvidence(dir)).toThrow(/silent data swap/);
  });

  it('recovered evidence must match before', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-erp-evidence-'));
    const payload = evidencePayload();
    fs.writeFileSync(path.join(dir, 'before.json'), JSON.stringify(payload));
    fs.writeFileSync(path.join(dir, 'after.json'), JSON.stringify(payload));
    fs.writeFileSync(
      path.join(dir, 'recovered.json'),
      JSON.stringify(evidencePayload({ cycles: { fingerprint: 'bad', count: 1, ids: ['x|a|1||'] } }))
    );
    expect(() => compareEvidence(dir)).toThrow(/recovered.json.*cycles/);
  });

  it('rejects plan when restored history versions changed', () => {
    const history = path.join(fixtures, 'restored-history-pre-a14b4ce.json');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-erp-plan-hist-'));
    const approved = path.join(dir, 'approved.json');
    const plan = computeMigrationPlan(history);
    fs.writeFileSync(approved, JSON.stringify({ ...plan.approvedPlan, restoredVersions: ['015', '999'] }));
    expect(() => validatePlanBeforeMigrate(history, approved)).toThrow(/history changed|versions differ/);
  });

  it('rejects unapproved grants_classify change in after', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-erp-evidence-grants-'));
    fs.writeFileSync(path.join(dir, 'before.json'), JSON.stringify(evidencePayload()));
    fs.writeFileSync(
      path.join(dir, 'after.json'),
      JSON.stringify(evidencePayload({ grants_classify: { fingerprint: 'changed-grants', count: 1 } }))
    );
    expect(() => compareEvidence(dir)).toThrow(/unexpected grants_classify/);
  });

  it('rejects plan revalidation when toApply drifted', () => {
    const history = path.join(fixtures, 'restored-history-pre-a14b4ce.json');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-erp-plan-'));
    const approved = path.join(dir, 'approved.json');
    fs.writeFileSync(
      approved,
      JSON.stringify({
        targetApplicationCommit: 'a14b4ce22a6d53514fd69392c3b32e7016d00e5e',
        toApply: ['nonexistent_migration.sql'],
        blocked: [],
      })
    );
    expect(() => validatePlanBeforeMigrate(history, approved)).toThrow(/toApply list changed/);
  });

  it('rejects tampered package manifest in export', () => {
    const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-erp-export-'));
    const rel = 'docs/changes/upgrade-recovery-a14b4ce/PACKAGE-MANIFEST.sha256.json';
    const manifestPath = path.join(exportDir, rel);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    const committed = {
      fileCount: 1,
      files: [{ path: 'package.json', sha256: 'deadbeef'.repeat(8), bytes: 1 }],
    };
    fs.writeFileSync(manifestPath, JSON.stringify(committed));
    fs.writeFileSync(path.join(exportDir, 'package.json'), '{"name":"web"}');
    expect(() => verifyPackageManifestFromExport(exportDir, rel)).toThrow(/SHA-256 drift/);
  });

  it('rejects unexpected object after recovery inventory compare', () => {
    const before = { objects: ['public|service_orders|r'], policies: [], fingerprint: 'a' };
    const recovered = {
      objects: ['public|service_orders|r', 'public|evil_table|r'],
      policies: [],
      fingerprint: 'b',
    };
    expect(() => compareInventories(before, recovered)).toThrow(/Unexpected objects/);
  });

  it('rejects UPGRADE_DATABASE_URL with forbidden port 54332 in export-evidence', async () => {
    const { exportEvidencePhase } = await import('./export-evidence.mjs');
    const prev = process.env.UPGRADE_DATABASE_URL;
    process.env.UPGRADE_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54332/postgres';
    try {
      await expect(exportEvidencePhase('before', os.tmpdir())).rejects.toThrow(/Forbidden port/);
    } finally {
      if (prev === undefined) delete process.env.UPGRADE_DATABASE_URL;
      else process.env.UPGRADE_DATABASE_URL = prev;
    }
  });

  it('rejects UPGRADE_DATABASE_URL without upgrade port 54342', () => {
    expect(() => assertUpgradeDbUrl('postgresql://postgres:postgres@127.0.0.1:54341/postgres')).toThrow(
      /must use port 54342/
    );
  });

  it('rejects UPGRADE_DATABASE_URL with forbidden port 54322 in export-evidence', async () => {
    const { exportEvidencePhase } = await import('./export-evidence.mjs');
    const prev = process.env.UPGRADE_DATABASE_URL;
    process.env.UPGRADE_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
    try {
      await expect(exportEvidencePhase('before', os.tmpdir())).rejects.toThrow(/Forbidden port/);
    } finally {
      if (prev === undefined) delete process.env.UPGRADE_DATABASE_URL;
      else process.env.UPGRADE_DATABASE_URL = prev;
    }
  });
});
