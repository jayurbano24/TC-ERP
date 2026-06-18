/**
 * Vincula OS/series a sap_transfer_documents usando línea de tiempo de clasificación.
 *
 * Uso:
 *   node repair_sap_linkage.js
 *   node repair_sap_linkage.js --apply
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeGuide(g) {
  return (g || '').trim().replace(/[''`´]/g, "'").replace(/-/g, '').toLowerCase();
}

function parseEsDateTime(line) {
  const m = line.match(
    /\[(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)\]/i
  );
  if (!m) return NaN;
  let hour = parseInt(m[4], 10);
  const isPm = m[7].replace(/\s/g, '').toLowerCase().startsWith('p');
  if (isPm && hour < 12) hour += 12;
  if (!isPm && hour === 12) hour = 0;
  return new Date(
    parseInt(m[3], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[1], 10),
    hour,
    parseInt(m[5], 10),
    parseInt(m[6], 10)
  ).getTime();
}

function parseClassificationEvents(notes) {
  const timeline = notes?.split('--- LÍNEA DE TIEMPO')[1] || notes || '';
  const events = [];
  const lines = timeline.split('\n');
  for (const line of lines) {
    if (!line.includes('CLASIFICACIÓN') || !line.includes('BOD-EQP')) continue;
    const guideMatch = line.match(/CLASIFICACIÓN \(Guía ([^)]+)\)/i);
    if (!guideMatch) continue;
    const at = parseEsDateTime(line);
    if (isNaN(at)) continue;
    const guides = guideMatch[1].split(',').map((g) => g.trim()).filter(Boolean);
    for (const guideNumber of guides) {
      events.push({ at, guideNumber });
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

function parseEquipmentBlocks(notes) {
  if (!notes?.includes('DETALLES BACKOFFICE')) return [];
  const section = notes.split('--- DETALLES BACKOFFICE ---')[1]?.split('--- LÍNEA DE TIEMPO')[0] || '';
  const blocks = [];
  const regex = /\[Guía ([^\]]+)\]([\s\S]*?)(?=\[Guía|---|$)/gi;
  let m;
  while ((m = regex.exec(section)) !== null) {
    const header = m[1].trim();
    const body = m[2];
    const sap = body.match(/Backoffice_SAP:\s*(.+)/i)?.[1]?.trim();
    if (!sap) continue;
    const brand = body.match(/Backoffice_Brand:\s*(.+)/i)?.[1]?.trim();
    const model = body.match(/Backoffice_Model:\s*(.+)/i)?.[1]?.trim();
    const category = body.match(/Backoffice_Category:\s*(.+)/i)?.[1]?.trim()?.toLowerCase();
    if (category && category !== 'equipo') continue;

    const guides = header.split('|')[0].split(',').map((g) => g.trim()).filter(Boolean);
    for (const guideNumber of guides) {
      blocks.push({ guideNumber, sap, brand, model });
    }
  }
  return blocks;
}

function findBrandId(brands, name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return (
    brands.find((b) => b.name.toLowerCase() === n)?.id ||
    brands.find((b) => n.includes(b.name.toLowerCase()) || b.name.toLowerCase().includes(n))?.id ||
    null
  );
}

function findModelId(models, brandId, name) {
  if (!name || !brandId) return null;
  const n = name.trim().toLowerCase();
  const pool = models.filter((m) => m.brand_id === brandId);
  return (
    pool.find((m) => m.name.toLowerCase() === n)?.id ||
    pool.find((m) => n.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(n))?.id ||
    null
  );
}

async function main() {
  console.log(APPLY ? '=== APLICAR REPARACIÓN SAP LINKAGE ===' : '=== DRY-RUN REPARACIÓN SAP LINKAGE ===\n');

  const { data: brands } = await supabase.from('brands').select('id, name');
  const { data: models } = await supabase.from('models').select('id, name, brand_id');

  const receptionIds = [...new Set((await supabase.from('sap_transfer_documents').select('reception_id')).data?.map((r) => r.reception_id) || [])];

  let linkedOs = 0;
  let linkedSeries = 0;
  const linkedOsIds = new Set();

  for (const receptionId of receptionIds) {
    const { data: rec } = await supabase.from('receptions').select('notes').eq('id', receptionId).single();
    if (!rec?.notes) continue;

    const events = parseClassificationEvents(rec.notes);
    const blocks = parseEquipmentBlocks(rec.notes);

    const { data: allOs } = await supabase
      .from('service_orders')
      .select('id, main_serial, brand_id, model_id, created_at, sap_transfer_id')
      .eq('reception_id', receptionId)
      .order('created_at', { ascending: true });

    const { data: sapTransfers } = await supabase
      .from('sap_transfer_documents')
      .select('id, sap_document_number, reception_guide_id, reception_guides(guide_number)')
      .eq('reception_id', receptionId);

    const guideToSap = new Map();
    for (const st of sapTransfers || []) {
      const g = st.reception_guides?.guide_number;
      if (g) guideToSap.set(normalizeGuide(g), st);
    }

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const nextAt = events[i + 1]?.at ?? Number.MAX_SAFE_INTEGER;
      const st = guideToSap.get(normalizeGuide(ev.guideNumber));
      if (!st) continue;

      const block = blocks.find((b) => normalizeGuide(b.guideNumber) === normalizeGuide(ev.guideNumber));
      if (!block) continue;

      const brandId = findBrandId(brands || [], block.brand);
      const modelId = findModelId(models || [], brandId, block.model);
      if (!brandId || !modelId) continue;

      const batchOs = (allOs || []).filter((os) => {
        if (linkedOsIds.has(os.id)) return false;
        if (os.sap_transfer_id) return false;
        if (os.brand_id !== brandId || os.model_id !== modelId) return false;
        const t = new Date(os.created_at).getTime();
        return t >= ev.at - 120000 && t < nextAt;
      });

      if (batchOs.length === 0) continue;

      console.log(`[LINK] Guía ${ev.guideNumber} → SAP ${st.sap_document_number} | ${block.brand} ${block.model} | ${batchOs.length} OS`);

      if (APPLY) {
        for (const os of batchOs) {
          await supabase
            .from('service_orders')
            .update({ sap_transfer_id: st.id, reception_guide_id: st.reception_guide_id })
            .eq('id', os.id);

          const { data: series } = await supabase
            .from('series')
            .update({ sap_transfer_id: st.id })
            .eq('service_order_id', os.id)
            .select('id');

          linkedSeries += series?.length || 0;
          linkedOsIds.add(os.id);
          linkedOs++;
        }
      } else {
        batchOs.forEach((os) => {
          linkedOsIds.add(os.id);
          linkedOs++;
        });
      }
    }

    // Segunda pasada: OS restantes por marca/modelo (exclusivo, orden timeline)
    for (const ev of events) {
      const st = guideToSap.get(normalizeGuide(ev.guideNumber));
      if (!st) continue;
      const block = blocks.find((b) => normalizeGuide(b.guideNumber) === normalizeGuide(ev.guideNumber));
      if (!block) continue;
      const brandId = findBrandId(brands || [], block.brand);
      const modelId = findModelId(models || [], brandId, block.model);
      if (!brandId || !modelId) continue;

      const { count: already } = await supabase
        .from('service_orders')
        .select('*', { count: 'exact', head: true })
        .eq('sap_transfer_id', st.id);

      if (already && already > 0) continue;

      const remaining = (allOs || []).filter(
        (os) =>
          !linkedOsIds.has(os.id) &&
          !os.sap_transfer_id &&
          os.brand_id === brandId &&
          os.model_id === modelId
      );

      if (!remaining.length) continue;
      console.log(`[LINK-2] Guía ${ev.guideNumber} → SAP ${st.sap_document_number} | ${remaining.length} OS (marca/modelo)`);

      if (APPLY) {
        for (const os of remaining) {
          await supabase
            .from('service_orders')
            .update({ sap_transfer_id: st.id, reception_guide_id: st.reception_guide_id })
            .eq('id', os.id);
          const { data: series } = await supabase
            .from('series')
            .update({ sap_transfer_id: st.id })
            .eq('service_order_id', os.id)
            .select('id');
          linkedSeries += series?.length || 0;
          linkedOsIds.add(os.id);
          linkedOs++;
        }
      } else {
        remaining.forEach((os) => {
          linkedOsIds.add(os.id);
          linkedOs++;
        });
      }
    }
  }

  console.log('\n--- Resumen ---');
  console.log(`OS ${APPLY ? 'vinculados' : 'a vincular'}: ${linkedOs}`);
  console.log(`Series ${APPLY ? 'vinculadas' : 'a vincular'}: ${linkedSeries}`);
  if (!APPLY) console.log('\nEjecute con --apply para aplicar.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
