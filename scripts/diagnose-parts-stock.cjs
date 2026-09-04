/**
 * Diagnóstico de consistencia entre parts_inventory y part_reservations.
 * Uso: node --env-file=.env.local scripts/diagnose-parts-stock.cjs
 */
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

(async () => {
  const { data: inventory, error: invError } = await db
    .from('parts_inventory')
    .select(
      'id, catalog_id, qty_on_hand, qty_reserved, qty_new_on_hand, qty_recovered_on_hand, qty_new_reserved, qty_recovered_reserved'
    );
  if (invError) throw invError;

  const { data: reservations, error: resError } = await db
    .from('part_reservations')
    .select('id, catalog_id, qty, source_type, status, request_item_id')
    .eq('status', 'ACTIVE');
  if (resError) throw resError;

  const { data: catalog } = await db.from('parts_catalog').select('id, sku, name');
  const skuById = new Map((catalog || []).map((row) => [row.id, row.sku]));

  const activeByCatalog = new Map();
  for (const res of reservations || []) {
    const bucket = activeByCatalog.get(res.catalog_id) || { NEW: 0, RECOVERED: 0, rows: [] };
    const source = res.source_type === 'RECOVERED' ? 'RECOVERED' : 'NEW';
    bucket[source] += Number(res.qty || 0);
    bucket.rows.push(res);
    activeByCatalog.set(res.catalog_id, bucket);
  }

  for (const inv of inventory || []) {
    const sku = skuById.get(inv.catalog_id) || inv.catalog_id;
    const active = activeByCatalog.get(inv.catalog_id) || { NEW: 0, RECOVERED: 0, rows: [] };
    const problems = [];
    if (Number(inv.qty_new_reserved) !== active.NEW) {
      problems.push(`qty_new_reserved=${inv.qty_new_reserved} vs reservas ACTIVE NEW=${active.NEW}`);
    }
    if (Number(inv.qty_recovered_reserved) !== active.RECOVERED) {
      problems.push(
        `qty_recovered_reserved=${inv.qty_recovered_reserved} vs reservas ACTIVE RECOVERED=${active.RECOVERED}`
      );
    }
    if (Number(inv.qty_on_hand) !== Number(inv.qty_new_on_hand) + Number(inv.qty_recovered_on_hand)) {
      problems.push('qty_on_hand != nuevo + recuperado');
    }
    if (Number(inv.qty_reserved) !== Number(inv.qty_new_reserved) + Number(inv.qty_recovered_reserved)) {
      problems.push('qty_reserved != nuevo + recuperado');
    }
    console.log(
      `${sku}: on_hand=${inv.qty_on_hand} (new ${inv.qty_new_on_hand} / rec ${inv.qty_recovered_on_hand}) ` +
        `reserved=${inv.qty_reserved} (new ${inv.qty_new_reserved} / rec ${inv.qty_recovered_reserved}) ` +
        `| reservas ACTIVE: new ${active.NEW}, rec ${active.RECOVERED} (${active.rows.length} filas)` +
        (problems.length ? `\n   >> DESCUADRE: ${problems.join(' | ')}` : '')
    );
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
