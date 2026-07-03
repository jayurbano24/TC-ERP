/**
 * Aplica migraciones 071+072 (finalize PX performance).
 * Uso: node scripts/apply_finalize_px_perf.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const migrations = [
  '071_finalize_px_perf.sql',
  '072_finalize_px_setbased.sql',
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rawUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

  if (rawUrl) {
    const connectionString = rawUrl
      .replace('?pgbouncer=true', '')
      .replace(':6543/', ':5432/');

    const { Client } = require('pg');
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await client.connect();
      await client.query("SET statement_timeout = '600s'");
      for (const file of migrations) {
        const sqlPath = path.join(__dirname, '../supabase/migrations', file);
        if (!fs.existsSync(sqlPath)) continue;
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log(`Aplicando ${file}...`);
        await client.query(sql);
        console.log(`✅ ${file}`);
      }
      await client.end();
      console.log('\n✅ Finalize PX perf aplicado vía DATABASE_URL.');
      return;
    } catch (e) {
      console.warn('DATABASE_URL falló:', e.message);
      console.warn('Intentando exec_sql...');
    }
  }

  if (!url || !key) {
    console.error('Configure DATABASE_URL o SUPABASE keys, o ejecute los SQL en SQL Editor.');
    process.exit(1);
  }

  for (const file of migrations) {
    const sqlPath = path.join(__dirname, '../supabase/migrations', file);
    if (!fs.existsSync(sqlPath)) continue;
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log(`Aplicando ${file} vía exec_sql...`);
    const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) {
      console.error(`Error en ${file}:`, await res.text());
      process.exit(1);
    }
    console.log(`✅ ${file}`);
  }

  console.log('\n✅ Finalize PX perf aplicado vía exec_sql.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
