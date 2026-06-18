/**
 * Limpia registros donde el courier (ej. Cargo Express) quedó guardado como agencia CAC.
 *
 * Uso:
 *   node fix_agency_courier.js           # dry-run
 *   node fix_agency_courier.js --apply   # ejecuta
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const COURIER_HINTS = [
  'cargo express',
  'cargo expreso',
  'guatex',
  'forza',
  'dhl',
  'fedex',
  'ups',
  'paquete express',
  'courier',
  'entrega directa',
];

function normalizeKey(v) {
  return (v || '').trim().toLowerCase();
}

function isCourierLabel(name, receptionCarrier) {
  if (!name?.trim()) return false;
  const n = normalizeKey(name);
  const carrier = normalizeKey(receptionCarrier || '');
  if (carrier && (n === carrier || carrier.includes(n) || n.includes(carrier))) return true;
  return COURIER_HINTS.some((h) => n.includes(h));
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log(APPLY ? '=== APLICAR LIMPIEZA COURIER≠AGENCIA ===' : '=== DRY-RUN LIMPIEZA ===\n');

  const { data: receptions } = await supabase
    .from('receptions')
    .select('id, carrier')
    .eq('source', 'cac');

  const carrierByReception = new Map((receptions || []).map((r) => [r.id, r.carrier]));

  const { data: sapDocs, error: sapErr } = await supabase
    .from('sap_transfer_documents')
    .select('id, reception_id, sap_document_number, agency');

  if (sapErr) {
    console.error(sapErr.message);
    process.exit(1);
  }

  let sapCleared = 0;
  for (const doc of sapDocs || []) {
    const carrier = carrierByReception.get(doc.reception_id);
    if (!doc.agency || !isCourierLabel(doc.agency, carrier)) continue;
    console.log(`  [SAP] ${doc.sap_document_number}: "${doc.agency}" → NULL (courier=${carrier || '?'})`);
    sapCleared++;
    if (APPLY) {
      await supabase.from('sap_transfer_documents').update({ agency: null }).eq('id', doc.id);
    }
  }

  const { data: guides, error: gErr } = await supabase
    .from('reception_guides')
    .select('id, guide_number, agency, reception_id');

  if (gErr) {
    console.error(gErr.message);
    process.exit(1);
  }

  let guideCleared = 0;
  for (const rg of guides || []) {
    const carrier = carrierByReception.get(rg.reception_id);
    if (!rg.agency || !isCourierLabel(rg.agency, carrier)) continue;
    console.log(`  [GUIDE] ${rg.guide_number}: "${rg.agency}" → NULL`);
    guideCleared++;
    if (APPLY) {
      await supabase.from('reception_guides').update({ agency: null }).eq('id', rg.id);
    }
  }

  console.log(`\nResumen: ${sapCleared} sap_transfer_documents, ${guideCleared} reception_guides`);
  if (!APPLY) console.log('Ejecute con --apply para persistir.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
