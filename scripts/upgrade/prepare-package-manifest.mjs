/**
 * Único escritor de PACKAGE-MANIFEST.sha256.json (fase preparación).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256FromGitIndex } from './git-index-bytes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function collectFiles(relEntry) {
  const abs = path.join(root, relEntry);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [relEntry.replace(/\\/g, '/')];
  const out = [];
  for (const name of fs.readdirSync(abs)) {
    out.push(...collectFiles(path.join(relEntry, name)));
  }
  return out;
}

export function preparePackageManifest() {
  const listPath = path.join(root, 'docs/changes/upgrade-recovery-a14b4ce/PACKAGE-FILE-LIST.json');
  const metaPath = path.join(root, 'docs/changes/upgrade-recovery-a14b4ce/validation-package-meta.json');
  const list = JSON.parse(fs.readFileSync(listPath, 'utf8'));
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const files = [];
  for (const p of list.paths) files.push(...collectFiles(p));
  files.sort();

  const entries = files.map((rel) => {
    const { sha256, bytes } = sha256FromGitIndex(root, rel);
    return { path: rel.replace(/\\/g, '/'), sha256, bytes, hashSource: 'git-index' };
  });

  let packageCommit = meta.validationPackageCommit;
  try {
    packageCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    packageCommit = meta.validationPackageCommit ?? 'UNSET_RUN_PREPARE';
  }

  const manifest = {
    validationPackageVersion: meta.validationPackageVersion,
    validationPackageCommit: packageCommit,
    targetApplicationCommit: meta.targetApplicationCommit,
    hashPolicy: 'docs/changes/upgrade-recovery-a14b4ce/HASH-POLICY.md',
    scopeDefinitionFile: 'docs/changes/upgrade-recovery-a14b4ce/PACKAGE-FILE-LIST.json',
    fileCount: entries.length,
    files: entries,
  };

  const outPath = path.join(root, 'docs/changes/upgrade-recovery-a14b4ce/PACKAGE-MANIFEST.sha256.json');
  const tmp = `${outPath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, outPath);
  return { outPath, fileCount: entries.length };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const { outPath, fileCount } = preparePackageManifest();
  console.log(`Prepared ${outPath} (${fileCount} files, git-index bytes)`);
}
