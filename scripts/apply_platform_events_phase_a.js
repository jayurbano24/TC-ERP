/**
 * Aplica Fase A — domain_events + outbox + emit_domain_event (migración 050)
 * Uso: node scripts/apply_platform_events_phase_a.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const sql = fs.readFileSync(
  path.join(__dirname, '../supabase/migrations/050_platform_events_phase_a.sql'),
  'utf8'
);

async function main() {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error('Configure DATABASE_URL en .env.local');
    console.error('O ejecute supabase/migrations/050_platform_events_phase_a.sql en SQL Editor.');
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
  console.log('✅ Fase A platform events (050) aplicada.');
  console.log('   Validar: scripts/metrics_baseline_phase_a.sql');
}

main().catch((e) => {
  console.error(e.message);
  console.log('\nEjecute manualmente: web/supabase/migrations/050_platform_events_phase_a.sql');
  process.exit(1);
});
