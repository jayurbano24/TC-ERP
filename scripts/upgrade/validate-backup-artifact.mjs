import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

/**
 * @param {string} manifestPath
 * @param {{ allowPlaceholder?: boolean }} opts
 */
export function validateBackupManifest(manifestPath, opts = {}) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const files = manifest.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Manifest must include non-empty files[]');
  }
  if (!manifest.targetGitCommit?.startsWith('a14b4ce')) {
    throw new Error('Manifest targetGitCommit must reference approved a14b4ce');
  }

  const errors = [];
  for (const entry of files) {
    const p = entry.path;
    if (!p || p.includes('..')) {
      errors.push(`Invalid manifest path: ${p}`);
      continue;
    }
    if (!fs.existsSync(p)) {
      errors.push(`Missing dump file: ${p}`);
      continue;
    }
    const stat = fs.statSync(p);
    if (typeof entry.bytes === 'number' && entry.bytes > 0 && stat.size !== entry.bytes) {
      errors.push(`Size mismatch ${p}: expected ${entry.bytes}, got ${stat.size}`);
    }
    const digest = sha256File(p);
    if (entry.sha256 && entry.sha256 !== 'FILL_AFTER_EXPORT' && entry.sha256 !== digest) {
      errors.push(`SHA-256 mismatch ${p}`);
    }
    if (!opts.allowPlaceholder && (!entry.sha256 || entry.sha256 === 'FILL_AFTER_EXPORT')) {
      errors.push(`SHA-256 not finalized for ${p}`);
    }
  }
  if (errors.length) {
    const err = new Error(`Backup manifest invalid:\n${errors.join('\n')}`);
    err.details = errors;
    throw err;
  }
  return manifest;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (isMain) {
  try {
    validateBackupManifest(process.argv[2]);
    console.log('Backup manifest OK');
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
