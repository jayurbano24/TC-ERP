/**
 * Aplica políticas RLS + RPC para sap_transfer_documents (027).
 * Uso: node apply_sap_rls.js
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const sql = fs.readFileSync(
  path.join(__dirname, 'supabase/migrations/027_sap_transfer_rls_fix.sql'),
  'utf8'
);

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
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
    console.log('✅ Políticas RLS aplicadas.');
    return;
  }

  // Fallback: ejecutar statements vía pg si no existe exec_sql
  const { Client } = require('pg');
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.log('RPC no disponible. Ejecute el SQL manualmente en Supabase SQL Editor:');
    console.log('  supabase/migrations/027_sap_transfer_rls_fix.sql');
    console.log('\nError RPC:', await res.text());
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('✅ Políticas RLS aplicadas vía DATABASE_URL.');
}

main().catch((e) => {
  console.error(e.message);
  console.log('\nEjecute manualmente en Supabase → SQL Editor:');
  console.log('  web/supabase/migrations/027_sap_transfer_rls_fix.sql');
  process.exit(1);
});
