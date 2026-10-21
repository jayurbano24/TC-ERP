/**
 * Compara manifiesto versionado con bytes del export (sin escribir manifiesto).
 */
import fs from 'node:fs';
import path from 'node:path';
import { sha256FromExportPath } from './git-index-bytes.mjs';

export function verifyPackageManifestFromExport(exportRoot, manifestRelPath) {
  const manifestPath = path.join(exportRoot, manifestRelPath.replace(/\//g, path.sep));
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing manifest in export: ${manifestRelPath}`);
  }
  const committed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errors = [];

  for (const entry of committed.files ?? []) {
    try {
      const live = sha256FromExportPath(exportRoot, entry.path);
      if (live.sha256 !== entry.sha256) {
        errors.push(`SHA-256 drift export vs manifest: ${entry.path}`);
      }
      if (typeof entry.bytes === 'number' && live.bytes !== entry.bytes) {
        errors.push(`Byte size drift: ${entry.path}`);
      }
    } catch (e) {
      errors.push(e.message);
    }
  }

  if (errors.length) {
    const err = new Error(`Package manifest verification failed:\n${errors.join('\n')}`);
    err.details = errors;
    throw err;
  }
  return { ok: true, fileCount: committed.fileCount };
}

const isMain = process.argv[1]?.endsWith('verify-package-manifest.mjs');
if (isMain) {
  const exportRoot = process.argv[2];
  const manifestRel = process.argv[3] ?? 'docs/changes/upgrade-recovery-a14b4ce/PACKAGE-MANIFEST.sha256.json';
  if (!exportRoot) {
    console.error('Usage: node verify-package-manifest.mjs <exportRoot> [manifestRelPath]');
    process.exit(2);
  }
  try {
    verifyPackageManifestFromExport(exportRoot, manifestRel);
    console.log('Package manifest OK (export bytes)');
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
