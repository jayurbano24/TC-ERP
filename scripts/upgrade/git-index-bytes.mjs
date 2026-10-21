import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Bytes exactly as stored in git index (prepared manifest). */
export function sha256FromGitIndex(gitRoot, relPath) {
  const gitRel = relPath.replace(/\\/g, '/');
  const buf = execFileSync('git', ['show', `:${gitRel}`], {
    cwd: gitRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { sha256: sha256Buffer(buf), bytes: buf.length, gitRel };
}

/** Bytes on disk under export root (verification). */
export function sha256FromExportPath(exportRoot, relPath) {
  const abs = path.join(exportRoot, relPath.replace(/\//g, path.sep));
  if (!fs.existsSync(abs)) {
    throw new Error(`Export missing: ${relPath}`);
  }
  const buf = fs.readFileSync(abs);
  return { sha256: sha256Buffer(buf), bytes: buf.length, abs };
}
