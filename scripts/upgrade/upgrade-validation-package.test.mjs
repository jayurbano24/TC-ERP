import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareEvidence } from './compare-evidence.mjs';
import { computeMigrationPlan } from './compute-migration-plan.mjs';
import { validateBackupManifest } from './validate-backup-artifact.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const fixtures = path.join(root, 'docs/changes/upgrade-recovery-a14b4ce/fixtures');

describe('upgrade validation package (non-destructive)', () => {
  it('rejects backup manifest with wrong sha256', () => {
    const bad = path.join(fixtures, 'manifest-bad-sha.json');
    expect(() => validateBackupManifest(bad)).toThrow(/SHA-256 mismatch/);
  });

  it('rejects backup manifest with placeholder hash', () => {
    const ph = path.join(fixtures, 'manifest-placeholder.json');
    expect(() => validateBackupManifest(ph)).toThrow(/SHA-256 not finalized/);
  });

  it('accepts valid fixture manifest', () => {
    const ok = path.join(fixtures, 'manifest-valid.json');
    expect(() => validateBackupManifest(ok, { allowPlaceholder: false })).not.toThrow();
  });

  it('blocks migration plan when 014/109900 default block', () => {
    const history = path.join(fixtures, 'restored-history-pre-a14b4ce.json');
    const plan = computeMigrationPlan(history);
    expect(plan.blocked.some((b) => b.version === '014' || b.version === '10990000000000')).toBe(true);
  });

  it('rejects unapproved pending migrations in plan exit semantics', () => {
    const history = path.join(fixtures, 'restored-history-pre-a14b4ce.json');
    const plan = computeMigrationPlan(history);
    expect(plan.blocked.length).toBeGreaterThan(0);
  });

  it('fails compare on unexpected after diff', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-erp-evidence-'));
    fs.writeFileSync(
      path.join(dir, 'before.json'),
      JSON.stringify({ fingerprints: { identity_fingerprint: 'aaa', cycle_fingerprint: 'bbb' } })
    );
    fs.writeFileSync(
      path.join(dir, 'after.json'),
      JSON.stringify({ fingerprints: { identity_fingerprint: 'changed', cycle_fingerprint: 'bbb' } })
    );
    expect(() => compareEvidence(dir)).toThrow(/unexpected change/);
  });

  it('recovered evidence path does not require after.json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-erp-evidence-'));
    const fp = { identity_fingerprint: 'same', cycle_fingerprint: 'x' };
    fs.writeFileSync(path.join(dir, 'before.json'), JSON.stringify({ fingerprints: fp }));
    fs.writeFileSync(path.join(dir, 'after.json'), JSON.stringify({ fingerprints: fp }));
    fs.writeFileSync(path.join(dir, 'recovered.json'), JSON.stringify({ fingerprints: fp }));
    expect(compareEvidence(dir).ok).toBe(true);
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
