import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REQUIRED_TOP = [
  'artifactId',
  'targetGitCommit',
  'files',
  'schemaMigrationsSnapshot',
  'bootstrapDecisions',
  'responsiblePartyAttestation',
  'automatedChecks',
];

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function pgRestoreList(dumpPath) {
  try {
    const out = execFileSync('pg_restore', ['--list', dumpPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.split('\n').filter(Boolean).length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`pg_restore --list failed (format/version): ${msg}`);
  }
}

/**
 * @param {string} manifestPath
 * @param {{ allowPlaceholder?: boolean, cwd?: string }} opts
 */
export function validateBackupManifest(manifestPath, opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errors = [];

  for (const key of REQUIRED_TOP) {
    if (manifest[key] === undefined) errors.push(`Missing required field: ${key}`);
  }

  if (!manifest.targetGitCommit?.startsWith('a14b4ce')) {
    errors.push('targetGitCommit must reference a14b4ce');
  }

  const files = manifest.files;
  if (!Array.isArray(files) || files.length === 0) {
    errors.push('files[] must be non-empty');
  } else if (files.length > 1 && !Array.isArray(manifest.restoreOrder)) {
    errors.push('Multi-file backup requires restoreOrder[] with explicit sequence');
  }

  if (manifest.automatedChecks) {
    if (manifest.automatedChecks.anonymizationVerified === true) {
      errors.push('automatedChecks.anonymizationVerified must not be true (not auto-certifiable)');
    }
  }

  if (!manifest.responsiblePartyAttestation?.name || !manifest.responsiblePartyAttestation?.datedUtc) {
    errors.push('responsiblePartyAttestation.name and datedUtc required (human attestation)');
  }

  for (const entry of files ?? []) {
    const p = path.isAbsolute(entry.path) ? entry.path : path.join(cwd, entry.path);
    if (entry.path?.includes('..')) {
      errors.push(`Invalid path: ${entry.path}`);
      continue;
    }
    if (!fs.existsSync(p)) {
      errors.push(`Missing dump: ${entry.path}`);
      continue;
    }
    const stat = fs.statSync(p);
    if (typeof entry.bytes === 'number' && entry.bytes > 0 && stat.size !== entry.bytes) {
      errors.push(`Size mismatch ${entry.path}`);
    }
    const digest = sha256File(p);
    if (entry.sha256 && entry.sha256 !== 'FILL_AFTER_EXPORT' && entry.sha256 !== digest) {
      errors.push(`SHA-256 mismatch ${entry.path}`);
    }
    if (!opts.allowPlaceholder && (!entry.sha256 || entry.sha256 === 'FILL_AFTER_EXPORT')) {
      errors.push(`SHA-256 not finalized for ${entry.path}`);
    }
    if (entry.format === 'fixture-bytes-only') {
      // Fixture de bytes para pruebas de manifiesto; no es dump pg_custom.
    } else if (entry.format === 'pg_custom' || (p.endsWith('.dump') && entry.format !== 'fixture-bytes-only')) {
      try {
        const lines = pgRestoreList(p);
        if (lines < 1) errors.push(`pg_restore --list empty for ${entry.path}`);
      } catch (e) {
        errors.push(e.message);
      }
    }
  }

  if (errors.length) {
    throw new Error(`Backup manifest invalid:\n${errors.join('\n')}`);
  }
  return manifest;
}

const isMain = process.argv[1]?.endsWith('validate-backup-artifact.mjs');
if (isMain) {
  try {
    validateBackupManifest(process.argv[2], { allowPlaceholder: process.argv.includes('--allow-placeholder') });
    console.log('Backup manifest OK');
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
