import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const listPath = path.join(root, 'docs/changes/upgrade-recovery-a14b4ce/PACKAGE-FILE-LIST.json');
const metaPath = path.join(root, 'docs/changes/upgrade-recovery-a14b4ce/validation-package-meta.json');

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256IndexedOrDisk(rel, abs) {
  const gitRel = rel.replace(/\\/g, '/');
  try {
    const buf = execFileSync('git', ['show', `:${gitRel}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
    return { sha256: sha256Buffer(buf), bytes: buf.length };
  } catch {
    const disk = fs.readFileSync(abs);
    return { sha256: sha256Buffer(disk), bytes: disk.length };
  }
}

function collectFiles(relEntry) {
  const abs = path.join(root, relEntry);
  if (!fs.existsSync(abs)) return [];
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [relEntry.replace(/\\/g, '/')];
  const out = [];
  for (const name of fs.readdirSync(abs)) {
    out.push(...collectFiles(path.join(relEntry, name)));
  }
  return out;
}

const list = JSON.parse(fs.readFileSync(listPath, 'utf8'));
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const files = [];
for (const p of list.paths) {
  files.push(...collectFiles(p));
}
files.sort();

const entries = files.map((rel) => {
  const abs = path.join(root, rel);
  const { sha256, bytes } = sha256IndexedOrDisk(rel, abs);
  return { path: rel.replace(/\\/g, '/'), sha256, bytes };
});

const manifest = {
  validationPackageVersion: meta.validationPackageVersion,
  targetApplicationCommit: meta.targetApplicationCommit,
  generatedAtUtc: new Date().toISOString(),
  scopeDefinitionFile: 'docs/changes/upgrade-recovery-a14b4ce/PACKAGE-FILE-LIST.json',
  fileCount: entries.length,
  files: entries,
};

if (process.argv.includes('--stdout')) {
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  process.exit(0);
}

const outPath = path.join(root, 'docs/changes/upgrade-recovery-a14b4ce/PACKAGE-MANIFEST.sha256.json');
const tmp = `${outPath}.tmp`;
fs.writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
fs.renameSync(tmp, outPath);
console.log(`Wrote ${outPath} (${entries.length} files)`);
