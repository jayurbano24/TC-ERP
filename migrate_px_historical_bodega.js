/**
 * Migración PX histórica: RECEPCIONADO_BODEGA_GENERAL → in_central_warehouse
 * Solo series de recepciones PX ya asignadas a caja activa (BOX-xxx / BODEGA_CENTRAL).
 *
 * Uso:
 *   node migrate_px_historical_bodega.js           # dry-run (preview)
 *   node migrate_px_historical_bodega.js --apply   # ejecuta UPDATE + audit
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const INACTIVE_RECEPTION = ['ELIMINADO', 'ELIMINADO POR BODEGA', 'ARCHIVADO', 'DEVUELTO'];
const BAD_RACK = ['ELIMINADO', 'DESPACHO'];
const BATCH_SIZE = 100;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchCandidates() {
  const all = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data: rows, error } = await supabase
      .from('series')
      .select(`
        id,
        serial_number,
        current_status,
        current_box_id,
        current_reception_id,
        receptions!inner (
          id,
          source,
          guide_number,
          sap_document,
          status,
          created_at
        ),
        boxes!inner (
          id,
          box_code,
          rack_location,
          reception_id
        )
      `)
      .eq('current_status', 'RECEPCIONADO_BODEGA_GENERAL')
      .not('current_box_id', 'is', null)
      .eq('receptions.source', 'px')
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!rows?.length) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all.filter((row) => {
    const rec = row.receptions;
    const box = row.boxes;
    if (!rec || !box) return false;
    if (INACTIVE_RECEPTION.includes(rec.status)) return false;
    if (box.reception_id !== rec.id) return false;
    const rack = box.rack_location || 'BODEGA_CENTRAL';
    if (BAD_RACK.includes(rack)) return false;
    return true;
  });
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }

  console.log(`=== MIGRACIÓN PX → Bodega General (${APPLY ? 'APLICAR' : 'DRY-RUN'}) ===\n`);

  const candidates = await fetchCandidates();
  const receptionIds = new Set(candidates.map((c) => c.receptions.id));

  console.log(`Series elegibles: ${candidates.length}`);
  console.log(`Recepciones PX afectadas: ${receptionIds.size}\n`);

  if (candidates.length === 0) {
    console.log('Nada que migrar.');
    return;
  }

  const byReception = new Map();
  for (const row of candidates) {
    const key = row.receptions.guide_number || row.receptions.sap_document || row.receptions.id;
    if (!byReception.has(key)) {
      byReception.set(key, { rec: row.receptions, series: [], box: row.boxes });
    }
    byReception.get(key).series.push(row.serial_number);
  }

  for (const [key, { rec, series, box }] of byReception) {
    console.log(
      `  ${rec.guide_number || rec.sap_document || rec.id} | box ${box.box_code} | ${series.length} series`
    );
    if (series.length <= 4) {
      console.log(`    → ${series.join(', ')}`);
    } else {
      console.log(`    → ${series.slice(0, 3).join(', ')} … (+${series.length - 3})`);
    }
  }

  if (!APPLY) {
    console.log('\nDry-run. Ejecute: node migrate_px_historical_bodega.js --apply');
    return;
  }

  const ids = candidates.map((c) => c.id);
  const now = new Date().toISOString();
  let updated = 0;

  for (const batch of chunk(ids, BATCH_SIZE)) {
    const { error: updateError } = await supabase
      .from('series')
      .update({ current_status: 'in_central_warehouse', updated_at: now })
      .in('id', batch)
      .eq('current_status', 'RECEPCIONADO_BODEGA_GENERAL');

    if (updateError) {
      console.error('Error en UPDATE (lote):', updateError.message);
      process.exit(1);
    }
    updated += batch.length;
    process.stdout.write(`  actualizadas ${updated}/${ids.length}\r`);
  }
  console.log('');

  const auditRows = candidates.map((row) => ({
    module: 'Logística',
    table_name: 'series',
    record_id: row.id,
    action: 'MIGRACION PX BODEGA',
    severity: 'INFO',
    old_values: { current_status: 'RECEPCIONADO_BODEGA_GENERAL' },
    new_values: {
      migration: '032_migrate_px_historical_bodega',
      current_status: 'in_central_warehouse',
      reception_id: row.current_reception_id,
      box_id: row.current_box_id,
      serial_number: row.serial_number,
      migrated_at: now,
    },
    observations: 'Migración PX histórico → Bodega General',
  }));

  for (const batch of chunk(auditRows, BATCH_SIZE)) {
    const { error: auditError } = await supabase.from('erp_audit_logs').insert(batch);
    if (auditError) {
      console.warn('Advertencia: audit parcial falló:', auditError.message);
      break;
    }
  }

  console.log(`\n✓ ${updated} series actualizadas a in_central_warehouse`);
  console.log(`✓ ${receptionIds.size} recepciones PX corregidas`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
