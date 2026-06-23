/**
 * Aplica Fase 3 Bodega Central (backfill + RPCs parciales + SAP sync).
 * Uso: node scripts/apply_warehouse_phase3.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const sql = fs.readFileSync(path.join(__dirname, 'apply_warehouse_phase3.sql'), 'utf8');

async function main() {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error('Configure DATABASE_URL en .env.local o ejecute apply_warehouse_phase3.sql en SQL Editor.');
    process.exit(1);
  }

  const { Client } = require('pg');
  const client = new Client({
    connectionString: dbUrl.replace('?pgbouncer=true', '').replace(':6543/', ':5432/'),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('✅ Fase 3 Bodega aplicada.');
}

main().catch((e) => {
  console.error(e.message);
  console.log('\nEjecute manualmente: web/scripts/apply_warehouse_phase3.sql');
  process.exit(1);
});
