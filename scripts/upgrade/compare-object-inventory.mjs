import fs from 'node:fs';
import { compareInventories } from './object-inventory.mjs';

export function compareObjectInventoryFiles(beforePath, recoveredPath) {
  const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  const recovered = JSON.parse(fs.readFileSync(recoveredPath, 'utf8'));
  return compareInventories(before, recovered);
}

const isMain = process.argv[1]?.endsWith('compare-object-inventory.mjs');
if (isMain) {
  try {
    compareObjectInventoryFiles(process.argv[2], process.argv[3]);
    console.log('Object inventory OK');
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
