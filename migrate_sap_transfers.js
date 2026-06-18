/**
 * Backfill sap_transfer_documents desde notes (Backoffice_SAP) y vincula OS/series.
 *
 * Uso:
 *   node migrate_sap_transfers.js           # dry-run
 *   node migrate_sap_transfers.js --apply   # ejecuta
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function findReceptionGuide(guides, guideNumber) {
  const key = normalizeGuide(guideNumber);
  let rg = (guides || []).find((g) => normalizeGuide(g.guide_number) === key);
  if (rg) return rg;
  return (guides || []).find(
    (g) =>
      normalizeGuide(g.guide_number).includes(key) ||
      key.includes(normalizeGuide(g.guide_number))
  );
}

async function ensureReceptionGuide(receptionId, guideNumber, agency) {
  let rg = null;
  const { data: existing } = await supabase
    .from('reception_guides')
    .select('id, guide_number, agency')
    .eq('reception_id', receptionId);

  rg = findReceptionGuide(existing, guideNumber);
  if (rg) return rg;

  if (!APPLY) {
    return { id: null, guide_number: guideNumber, agency, _wouldCreate: true };
  }

  const { data: inserted, error } = await supabase
    .from('reception_guides')
    .upsert(
      [{
        reception_id: receptionId,
        guide_number: guideNumber,
        status: 'CLASIFICADO',
        category: 'equipo',
        agency: agency || null,
      }],
      { onConflict: 'reception_id,guide_number' }
    )
    .select('id, guide_number, agency')
    .single();

  if (error) {
    console.error(`    Error creando reception_guide ${guideNumber}: ${error.message}`);
    return null;
  }
  return inserted;
}

function normalizeGuide(g) {
  return (g || '').trim().replace(/[''`´]/g, "'").toLowerCase();
}

const COURIER_HINTS = [
  'cargo express', 'cargo expreso', 'guatex', 'forza', 'dhl', 'fedex', 'ups',
  'paquete express', 'courier', 'entrega directa',
];

function isCourierLabel(name, receptionCarrier) {
  if (!name?.trim()) return false;
  const n = (name || '').trim().toLowerCase();
  const carrier = (receptionCarrier || '').trim().toLowerCase();
  if (carrier && (n === carrier || carrier.includes(n) || n.includes(carrier))) return true;
  return COURIER_HINTS.some((h) => n.includes(h));
}

function sanitizeAgency(raw, receptionCarrier) {
  if (!raw?.trim()) return null;
  if (isCourierLabel(raw, receptionCarrier)) return null;
  return raw.trim();
}

function parseGuideSapBlocks(notes) {
  if (!notes || !notes.includes('DETALLES BACKOFFICE')) return [];

  const section = notes.split('--- DETALLES BACKOFFICE ---')[1]?.split('--- LÍNEA DE TIEMPO')[0] || '';
  const blocks = [];
  const regex = /\[Guía ([^\]|]+)(?:\s*\|\s*SAP\s*([^\]]+))?\]([\s\S]*?)(?=\[Guía|---|$)/gi;
  let m;
  while ((m = regex.exec(section)) !== null) {
    const guidePart = m[1].trim();
    const sapFromHeader = m[2]?.trim();
    const body = m[3] || '';
    const sapFromBody = body.match(/Backoffice_SAP:\s*(.+)/i)?.[1]?.trim();
    const agency = body.match(/Backoffice_Agency:\s*(.+)/i)?.[1]?.trim();
    const sapDoc = sapFromHeader || sapFromBody;
    if (!sapDoc) continue;

    const guides = guidePart.split(',').map((g) => g.trim()).filter(Boolean);
    for (const guideNumber of guides) {
      blocks.push({ guideNumber, sapDocument: sapDoc, agency });
    }
  }
  return blocks;
}

async function main() {
  console.log(APPLY ? '=== APLICAR MIGRACIÓN SAP ===' : '=== DRY-RUN MIGRACIÓN SAP ===\n');

  const { data: receptions, error } = await supabase
    .from('receptions')
    .select('id, guide_number, notes, source, carrier')
    .eq('source', 'cac')
    .not('notes', 'is', null);

  if (error) {
    console.error('Error cargando recepciones:', error.message);
    process.exit(1);
  }

  let createdTransfers = 0;
  let linkedOs = 0;
  let linkedSeries = 0;
  let skipped = 0;

  for (const rec of receptions || []) {
    const blocks = parseGuideSapBlocks(rec.notes);
    if (!blocks.length) continue;

    const uniqueBlocks = new Map();
    for (const b of blocks) {
      const key = `${normalizeGuide(b.guideNumber)}|${b.sapDocument.toUpperCase()}`;
      if (!uniqueBlocks.has(key)) uniqueBlocks.set(key, b);
    }

    const { data: guides } = await supabase
      .from('reception_guides')
      .select('id, guide_number, agency')
      .eq('reception_id', rec.id);

    for (const block of uniqueBlocks.values()) {
      const rg = await ensureReceptionGuide(
        rec.id,
        block.guideNumber,
        sanitizeAgency(block.agency, rec.carrier)
      );
      if (!rg || (!rg.id && !rg._wouldCreate)) {
        console.warn(`  [SKIP] Sin reception_guide para ${rec.id.slice(0, 8)} guía ${block.guideNumber}`);
        skipped++;
        continue;
      }
      if (rg._wouldCreate) {
        console.log(`  [WOULD CREATE GUIDE] ${block.guideNumber}`);
        createdTransfers++;
        continue;
      }

      const { data: existing } = await supabase
        .from('sap_transfer_documents')
        .select('id')
        .eq('reception_guide_id', rg.id)
        .eq('sap_document_number', block.sapDocument)
        .maybeSingle();

      let sapTransferId = existing?.id;

      if (!sapTransferId) {
        console.log(`  [NEW] ${block.guideNumber} → SAP ${block.sapDocument}`);
        if (APPLY) {
          const { data: inserted, error: insErr } = await supabase
            .from('sap_transfer_documents')
            .insert([{
              reception_id: rec.id,
              reception_guide_id: rg.id,
              sap_document_number: block.sapDocument,
              agency: sanitizeAgency(block.agency, rec.carrier) || sanitizeAgency(rg.agency, rec.carrier) || null,
              registered_by: 'migrate_sap_transfers.js',
              status: 'PENDIENTE_INGRESO_BODEGA',
            }])
            .select('id')
            .single();
          if (insErr) {
            console.error(`    Error insert: ${insErr.message}`);
            skipped++;
            continue;
          }
          sapTransferId = inserted.id;
        }
        createdTransfers++;
      }

      if (!sapTransferId) continue;

      const { data: osList } = await supabase
        .from('service_orders')
        .select('id, main_serial, sap_transfer_id, reception_guide_id')
        .eq('reception_id', rec.id)
        .eq('reception_guide_id', rg.id)
        .is('sap_transfer_id', null);

      for (const os of osList || []) {
        console.log(`    OS ${os.id.slice(0, 8)} main=${os.main_serial} → SAP ${block.sapDocument}`);
        if (APPLY) {
          await supabase
            .from('service_orders')
            .update({ sap_transfer_id: sapTransferId })
            .eq('id', os.id);

          await supabase
            .from('series')
            .update({ sap_transfer_id: sapTransferId })
            .eq('service_order_id', os.id);
        }
        linkedOs++;
      }

      if (APPLY) {
        const { count } = await supabase
          .from('series')
          .select('*', { count: 'exact', head: true })
          .eq('current_reception_id', rec.id)
          .is('sap_transfer_id', null)
          .not('service_order_id', 'is', null);

        if (count && count > 0 && (osList || []).length === 0) {
          const { data: allOs } = await supabase
            .from('service_orders')
            .select('id')
            .eq('reception_id', rec.id)
            .eq('reception_guide_id', rg.id);

          for (const os of allOs || []) {
            await supabase.from('service_orders').update({ sap_transfer_id: sapTransferId }).eq('id', os.id);
            await supabase.from('series').update({ sap_transfer_id: sapTransferId }).eq('service_order_id', os.id);
            linkedSeries++;
          }
        }
      }
    }
  }

  console.log('\n--- Resumen ---');
  console.log(`Traslados SAP ${APPLY ? 'creados' : 'a crear'}: ${createdTransfers}`);
  console.log(`OS ${APPLY ? 'vinculados' : 'a vincular'}: ${linkedOs}`);
  console.log(`Series extra: ${linkedSeries}`);
  console.log(`Omitidos: ${skipped}`);
  if (!APPLY) console.log('\nEjecute con --apply para aplicar cambios.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
