const fs = require('fs');
const files = [
  'src/app/(erp)/recepcion/page.tsx', 
  'src/app/(erp)/produccion/backoffice/page.tsx', 
  'src/app/(erp)/bodega/gestion/page.tsx', 
  'src/app/(erp)/bodega/inventario/page.tsx', 
  'src/app/(erp)/produccion/taller/page.tsx',
  'src/app/(erp)/consulta/page.tsx'
];
files.forEach(f => {
  if(fs.existsSync(f)) {
    let c = fs.readFileSync(f, 'utf8');
    c = c.replaceAll(`|| 'Admin User'`, `|| 'SISTEMA'`);
    c = c.replaceAll(`useState('Admin User')`, `useState('SISTEMA')`);
    
    // Si tiene loadUser con 'Admin User', cambiar el if
    c = c.replaceAll(`data.full_name !== 'Admin User'`, `data.full_name !== 'SISTEMA'`);
    
    fs.writeFileSync(f, c);
    console.log('Updated ' + f);
  }
});
