/**
 * Archiva cajas de bodega central sin series vinculadas (rack_location = ELIMINADO).
 *
 * Uso:
 *   node scripts/archive_empty_boxes.js           # dry-run
 *   node scripts/archive_empty_boxes.js --apply   # ejecutar
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: boxes, error } = await supabase
    .from('boxes')
    .select('id, box_code, rack_location, reception_id')
    .not('rack_location', 'in', '("ELIMINADO","DESPACHO")');

  if (error) throw error;

  const empty = [];
  for (const box of boxes || []) {
    const { count } = await supabase
      .from('series')
      .select('*', { count: 'exact', head: true })
      .eq('current_box_id', box.id);
    if (!count) empty.push(box);
  }

  console.log(`Cajas vacías encontradas: ${empty.length}`);
  empty.slice(0, 20).forEach((b) => console.log(`  ${b.box_code} (${b.rack_location || 'sin rack'})`));
  if (empty.length > 20) console.log(`  … +${empty.length - 20} más`);

  if (!APPLY || empty.length === 0) {
    if (!APPLY && empty.length) console.log('\nDry-run. Ejecute: node scripts/archive_empty_boxes.js --apply');
    return;
  }

  const { error: upErr } = await supabase
    .from('boxes')
    .update({ rack_location: 'ELIMINADO' })
    .in('id', empty.map((b) => b.id));

  if (upErr) throw upErr;
  console.log(`\n✓ ${empty.length} cajas archivadas (ELIMINADO)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
