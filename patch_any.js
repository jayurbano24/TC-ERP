const fs = require('fs');

function fixAny(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\.map\(\s*([a-zA-Z_0-9]+)\s*=>/g, '.map(($1: any) =>');
  fs.writeFileSync(file, content);
}

fixAny('src/app/(erp)/recepcion/components/CacReceptionTab.tsx');
fixAny('src/app/(erp)/recepcion/components/PxReceptionTab.tsx');
fixAny('src/app/(erp)/recepcion/components/HistoryTab.tsx');
console.log('Fixed any types');
