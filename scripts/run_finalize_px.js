/**
 * Finaliza recepción PX vía Postgres directo (sin timeout del SQL Editor).
 * Uso:
 *   node scripts/run_finalize_px.js <reception_uuid> [expected_version]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { Client } = require('pg');

const RECEPTION_ID = process.argv[2] || '82843fcd-f19c-4ebe-8a38-e25488463084';
const EXPECTED_VERSION = parseInt(process.argv[3] || '1', 10);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Falta DATABASE_URL en .env.local');
    process.exit(1);
  }

  const directUrl = url.replace('?pgbouncer=true', '').replace(':6543/', ':5432/');
  const client = new Client({
    connectionString: directUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    query_timeout: 600000,
  });

  console.log(`Finalizando recepción ${RECEPTION_ID} (version=${EXPECTED_VERSION})...`);
  console.log('Puede tardar varios minutos con recepciones grandes. No interrumpir.\n');

  const started = Date.now();
  await client.connect();
  await client.query("SET statement_timeout = '600s'");

  const before = await client.query(
    `SELECT status, version, guide_number FROM public.receptions WHERE id = $1`,
    [RECEPTION_ID],
  );
  console.log('Antes:', before.rows[0]);

  const { rows, rowCount } = await client.query(
    `SELECT public.finalize_px_reception_tx($1::uuid, $2, NULL, NULL, 'OPERADOR') AS result`,
    [RECEPTION_ID, EXPECTED_VERSION],
  );

  const after = await client.query(
    `SELECT status, version, guide_number FROM public.receptions WHERE id = $1`,
    [RECEPTION_ID],
  );

  const counts = await client.query(
    `SELECT capture_status, count(*)::int AS n
     FROM public.px_reception_equipment
     WHERE reception_id = $1
     GROUP BY capture_status
     ORDER BY capture_status`,
    [RECEPTION_ID],
  );

  await client.end();

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n✅ Completado en ${elapsed}s`);
  console.log('Resultado RPC:', rows[0]?.result);
  console.log('Después:', after.rows[0]);
  console.log('Equipos:', counts.rows);
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message);
  if (e.code === '28P01') {
    console.error('Contraseña incorrecta. Copie la de Supabase → Settings → Database → Connection string.');
  }
  process.exit(1);
});
