/**
 * Finaliza recepción PX por lotes (evita timeout SQL Editor / WAL gigante).
 * Uso:
 *   node scripts/run_finalize_px_batch.js [reception_uuid] [expected_version] [batch_size]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { Client } = require('pg');

const RECEPTION_ID = process.argv[2] || '82843fcd-f19c-4ebe-8a38-e25488463084';
const EXPECTED_VERSION = parseInt(process.argv[3] || '1', 10);
const BATCH_SIZE = parseInt(process.argv[4] || '50', 10);

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
  });

  await client.connect();
  await client.query("SET statement_timeout = '180s'");

  console.log(`Finalize por lotes: ${RECEPTION_ID} (batch=${BATCH_SIZE})\n`);

  const prep = await client.query(
    `SELECT public.finalize_px_reception_prep_tx($1::uuid, $2, NULL, NULL) AS result`,
    [RECEPTION_ID, EXPECTED_VERSION],
  );
  console.log('Prep:', JSON.stringify(prep.rows[0]?.result));

  let iteration = 0;
  let phase = 'start';

  while (phase !== 'done' && iteration < 500) {
    iteration += 1;
    const started = Date.now();
    const { rows } = await client.query(
      `SELECT public.finalize_px_reception_batch_tx($1::uuid, $2, NULL, NULL, 'OPERADOR', $3) AS result`,
      [RECEPTION_ID, EXPECTED_VERSION, BATCH_SIZE],
    );
    const result = rows[0]?.result || {};
    phase = result.phase;
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `[${iteration}] ${elapsed}s phase=${phase} promoted=${result.promoted_this_batch ?? '-'} remaining=${result.remaining_active ?? '-'}`,
    );
    if (result.next) console.log(`     → ${result.next}`);
    if (phase === 'done') {
      console.log('\n✅ Finalizado:', JSON.stringify(result, null, 2));
      break;
    }
  }

  if (phase !== 'done') {
    console.error('\n❌ No terminó en 500 iteraciones. Revise estado en BD.');
    process.exit(1);
  }

  const status = await client.query(
    `SELECT status, version, guide_number, received_units FROM public.receptions WHERE id = $1`,
    [RECEPTION_ID],
  );
  console.log('Recepción:', status.rows[0]);
  await client.end();
}

main().catch((e) => {
  console.error('❌', e.message);
  if (e.code === '28P01') {
    console.error('Resetee la contraseña en Supabase → Settings → Database y actualice DATABASE_URL.');
  }
  process.exit(1);
});
