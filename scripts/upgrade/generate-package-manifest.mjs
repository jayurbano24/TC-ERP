/**
 * @deprecated Use prepare-package-manifest.mjs + verify-package-manifest.mjs
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

console.error('DEPRECATED: use npm run supabase:upgrade:prepare-manifest');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
execFileSync('node', ['scripts/upgrade/prepare-package-manifest.mjs'], { cwd: root, stdio: 'inherit' });
