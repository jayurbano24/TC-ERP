/**
 * Finaliza REC-800009 vía Supabase API (service role) — NO requiere DATABASE_URL.
 * Uso:
 *   node scripts/run_finalize_px_via_api.js [reception_uuid] [expected_version] [batch_size]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const RECEPTION_ID = process.argv[2] || '82843fcd-f19c-4ebe-8a38-e25488463084';
const EXPECTED_VERSION = parseInt(process.argv[3] || '1', 10);
const BATCH_SIZE = parseInt(process.argv[4] || '10', 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(supabase, fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message} (${error.code || 'ERR'})`);
  return data;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Finalize vía API: ${RECEPTION_ID} (batch=${BATCH_SIZE})\n`);

  // Prep: 1 caja por RPC
  for (let i = 1; i <= 40; i += 1) {
    const started = Date.now();
    let result;
    try {
      result = await rpc(supabase, 'finalize_px_reception_prep_one_box_tx', {
        p_reception_id: RECEPTION_ID,
        p_expected_version: EXPECTED_VERSION,
      });
    } catch (e) {
      console.error(`Prep [${i}] error:`, e.message);
      if (e.message.includes('Could not find the function')) {
        console.error('Aplique migración 077_finalize_px_prep_one_box.sql en SQL Editor primero.');
      }
      throw e;
    }
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `[prep ${i}] ${elapsed}s phase=${result.phase} box=${result.box_code ?? '-'} remaining=${result.boxes_remaining}`,
    );
    if (result.phase === 'prepared' || result.boxes_remaining === 0) break;
    await sleep(300);
  }

  // Promover lotes
  let phase = 'promoting';
  for (let i = 1; i <= 500 && phase !== 'done'; i += 1) {
    const started = Date.now();
    const result = await rpc(supabase, 'finalize_px_reception_batch_tx', {
      p_reception_id: RECEPTION_ID,
      p_expected_version: EXPECTED_VERSION,
      p_variance_reason: null,
      p_operator_id: null,
      p_operator_name: 'OPERADOR',
      p_batch_size: BATCH_SIZE,
    });
    phase = result.phase;
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `[batch ${i}] ${elapsed}s phase=${phase} promoted=${result.promoted_this_batch ?? '-'} remaining=${result.remaining_active ?? '-'}`,
    );
    if (phase === 'done') {
      console.log('\n✅ Finalizado:', JSON.stringify(result, null, 2));
      break;
    }
    await sleep(500);
  }

  if (phase !== 'done') {
    console.error('\n❌ No llegó a phase=done. Revise estado en BD.');
    process.exit(1);
  }

  const { data: rec, error } = await supabase
    .from('receptions')
    .select('status, version, guide_number, received_units')
    .eq('id', RECEPTION_ID)
    .single();
  if (error) throw error;
  console.log('Recepción:', rec);
}

main().catch((e) => {
  console.error('\n❌', e.message);
  process.exit(1);
});
