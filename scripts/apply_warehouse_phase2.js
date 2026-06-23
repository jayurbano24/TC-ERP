/**
 * Aplica Fase 2 Bodega Central (warehouse_movements + RPCs + historial).
 * Uso: node scripts/apply_warehouse_phase2.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const sql = fs.readFileSync(path.join(__dirname, 'apply_warehouse_phase2.sql'), 'utf8');

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

  if (dbUrl) {
    const { Client } = require('pg');
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    await client.query(sql);
    await client.end();
    console.log('✅ Fase 2 Bodega aplicada vía DATABASE_URL.');
    return;
  }

  if (!url || !key) {
    console.error('Faltan credenciales. Configure DATABASE_URL o SUPABASE keys.');
    process.exit(1);
  }

  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (res.ok) {
    console.log('✅ Fase 2 Bodega aplicada vía exec_sql RPC.');
    return;
  }

  console.error('No se pudo aplicar automáticamente. Ejecute en Supabase SQL Editor:');
  console.error('  web/scripts/apply_warehouse_phase2.sql');
  console.error(await res.text());
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
