/**
 * Materializa el alcance del paquete con bytes exactos del índice Git (sin CRLF smudge).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

export function materializeGitIndexExport(exportRoot) {
  const listPath = path.join(root, 'docs/changes/upgrade-recovery-a14b4ce/PACKAGE-FILE-LIST.json');
  const list = JSON.parse(fs.readFileSync(listPath, 'utf8'));
  const files = [];
  for (const p of list.paths) files.push(...collectFiles(p));
  files.sort();

  const writeIndexBlob = (gitRel) => {
    const buf = execFileSync('git', ['show', `:${gitRel}`], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const dest = path.join(exportRoot, gitRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
  };

  for (const rel of files) {
    writeIndexBlob(rel.replace(/\\/g, '/'));
  }

  const manifestRel = 'docs/changes/upgrade-recovery-a14b4ce/PACKAGE-MANIFEST.sha256.json';
  try {
    writeIndexBlob(manifestRel);
  } catch {
    throw new Error(`Export requires staged manifest: ${manifestRel}`);
  }

  return files.length;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const exportRoot = process.argv[2];
  if (!exportRoot) {
    console.error('Usage: node materialize-git-index-export.mjs <exportRoot>');
    process.exit(2);
  }
  const n = materializeGitIndexExport(exportRoot);
  console.log(`Materialized ${n} files to ${exportRoot}`);
}
