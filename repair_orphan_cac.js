/**
 * Repara ingresos CAC "a medias": notas de clasificación pero sin OS TC-XXX.
 * Restaura la recepción a RECEPCIONADA para reprocesar desde Bandeja.
 *
 * Uso:
 *   node repair_orphan_cac.js                    # listar huérfanos
 *   node repair_orphan_cac.js --apply            # reparar todos
 *   node repair_orphan_cac.js --apply TEST-ING    # solo guías que contengan el texto
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const apply = process.argv.includes('--apply');
const guideFilter = process.argv.find((a) => !a.startsWith('-') && a !== process.argv[1]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function stripFailedClassificationNotes(notes) {
  if (!notes) return notes;
  let base = notes.split('--- DETALLES BACKOFFICE ---')[0].trim();
  base = base.replace(/\nGuías Procesadas:.*$/m, '').trim();

  const timelineMatch = notes.match(/--- LÍNEA DE TIEMPO \(MATRIZ\) ---([\s\S]*?)(?:\n\nStatus:|$)/);
  let timeline = timelineMatch ? timelineMatch[1].trim() : '';
  timeline = timeline
    .split('\n')
    .filter((line) => !/CLASIFICACIÓN/i.test(line))
    .join('\n')
    .trim();

  const rebuilt =
    base +
    (timeline
      ? `\n\n--- LÍNEA DE TIEMPO (MATRIZ) ---\n${timeline}`
      : '');

  return rebuilt.trim();
}

async function main() {
  const { data: receptions, error } = await supabase
    .from('receptions')
    .select('id, guide_number, status, notes, processed_guides, source')
    .eq('source', 'cac')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const orphans = [];
  for (const rec of receptions || []) {
    const notes = rec.notes || '';
    const hasClassif =
      /clasificación/i.test(notes) ||
      /--- DETALLES BACKOFFICE ---/i.test(notes) ||
      /Backoffice_Agency:/i.test(notes);
    if (!hasClassif) continue;

    if (guideFilter) {
      const q = guideFilter.toLowerCase();
      if (
        !(rec.guide_number || '').toLowerCase().includes(q) &&
        !notes.toLowerCase().includes(q)
      ) {
        continue;
      }
    }

    const { count: osCount } = await supabase
      .from('service_orders')
      .select('*', { count: 'exact', head: true })
      .eq('reception_id', rec.id);

    if ((osCount || 0) > 0) continue;

    orphans.push(rec);
  }

  if (!orphans.length) {
    console.log('No hay ingresos CAC huérfanos (notas de clasificación sin OS).');
    return;
  }

  console.log(`\n=== ${orphans.length} ingreso(s) huérfano(s) ===\n`);
  for (const o of orphans) {
    console.log(`  • ${o.guide_number}  status=${o.status}  id=${o.id}`);
  }

  if (!apply) {
    console.log('\nEjecute con --apply para restaurar a RECEPCIONADA y limpiar notas de clasificación fallida.');
    return;
  }

  for (const o of orphans) {
    const cleanNotes = stripFailedClassificationNotes(o.notes);

    await supabase
      .from('sap_transfer_documents')
      .delete()
      .eq('reception_id', o.id);

    await supabase
      .from('reception_guides')
      .update({
        status: 'PENDIENTE',
        category: null,
        agency: null,
        classified_by: null,
        classified_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('reception_id', o.id);

    const { error: updErr } = await supabase
      .from('receptions')
      .update({
        status: 'RECEPCIONADA',
        processed_guides: [],
        notes: cleanNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', o.id);

    if (updErr) {
      console.error(`Error reparando ${o.guide_number}:`, updErr.message);
    } else {
      console.log(`✅ Reparado: ${o.guide_number}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
