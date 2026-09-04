/**
 * Reconcilia parts_inventory contra el libro de movimientos.
 *
 * Los despachos que fallaron a medias (antes de la corrección de partsService)
 * descontaban el físico sin registrar el movimiento DISPATCH, dejando el stock
 * por debajo de lo que dice la auditoría. Este script detecta esa diferencia y
 * la corrige dejando un movimiento de ajuste trazable.
 *
 * Uso:
 *   node --env-file=.env.local scripts/reconcile-parts-stock.cjs           (simulación)
 *   node --env-file=.env.local scripts/reconcile-parts-stock.cjs --apply   (aplica)
 */
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const NOTE = 'Reconciliación de inventario: despachos fallidos sin movimiento registrado';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const INBOUND = new Set(['IN_PURCHASE', 'IN_ADJUST', 'IN_RETURN_GOOD']);
const OUTBOUND = new Set(['OUT_ADJUST', 'DISPATCH']);

(async () => {
  const { data: inventory, error: invError } = await db
    .from('parts_inventory')
    .select(
      'id, catalog_id, qty_on_hand, qty_new_on_hand, qty_recovered_on_hand, qty_reserved, qty_new_reserved, qty_recovered_reserved'
    );
  if (invError) throw invError;

  // Los ajustes que escribe este mismo script ya representan la corrección: si
  // se contaran como ingresos, cada corrida pediría corregir de nuevo.
  const { data: movements, error: movError } = await db
    .from('part_movements')
    .select('catalog_id, movement_type, qty, source_type, ref_type')
    .or('ref_type.is.null,ref_type.neq.stock_reconciliation');
  if (movError) throw movError;

  const { data: catalog } = await db.from('parts_catalog').select('id, sku, name');
  const skuById = new Map((catalog || []).map((row) => [row.id, row.sku]));

  const expected = new Map();
  for (const m of movements || []) {
    const bucket = expected.get(m.catalog_id) || { NEW: 0, RECOVERED: 0 };
    const source = m.source_type === 'RECOVERED' ? 'RECOVERED' : 'NEW';
    if (INBOUND.has(m.movement_type)) bucket[source] += Number(m.qty || 0);
    else if (OUTBOUND.has(m.movement_type)) bucket[source] -= Number(m.qty || 0);
    expected.set(m.catalog_id, bucket);
  }

  let changes = 0;
  for (const inv of inventory || []) {
    const sku = skuById.get(inv.catalog_id) || inv.catalog_id;
    const exp = expected.get(inv.catalog_id) || { NEW: 0, RECOVERED: 0 };
    const deltaNew = exp.NEW - Number(inv.qty_new_on_hand);
    const deltaRecovered = exp.RECOVERED - Number(inv.qty_recovered_on_hand);
    if (deltaNew === 0 && deltaRecovered === 0) {
      console.log(`${sku}: OK (nuevo ${inv.qty_new_on_hand}, recuperado ${inv.qty_recovered_on_hand})`);
      continue;
    }

    changes += 1;
    const nextNew = Number(inv.qty_new_on_hand) + deltaNew;
    const nextRecovered = Number(inv.qty_recovered_on_hand) + deltaRecovered;
    console.log(
      `${sku}: AJUSTE nuevo ${inv.qty_new_on_hand} -> ${nextNew} (${deltaNew >= 0 ? '+' : ''}${deltaNew}), ` +
        `recuperado ${inv.qty_recovered_on_hand} -> ${nextRecovered} (${deltaRecovered >= 0 ? '+' : ''}${deltaRecovered})`
    );

    if (nextNew < Number(inv.qty_new_reserved) || nextRecovered < Number(inv.qty_recovered_reserved)) {
      console.log('   >> OMITIDO: el ajuste dejaría el físico por debajo de lo reservado');
      continue;
    }
    if (!APPLY) continue;

    const { error: updateError } = await db
      .from('parts_inventory')
      .update({
        qty_on_hand: nextNew + nextRecovered,
        qty_new_on_hand: nextNew,
        qty_recovered_on_hand: nextRecovered,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inv.id);
    if (updateError) throw updateError;

    for (const [source, delta] of [
      ['NEW', deltaNew],
      ['RECOVERED', deltaRecovered],
    ]) {
      if (delta === 0) continue;
      const { error: movementError } = await db.from('part_movements').insert({
        catalog_id: inv.catalog_id,
        movement_type: delta > 0 ? 'IN_ADJUST' : 'OUT_ADJUST',
        qty: Math.abs(delta),
        source_type: source,
        unit_cost: 0,
        ref_type: 'stock_reconciliation',
        notes: NOTE,
      });
      if (movementError) throw movementError;
    }
    console.log('   >> aplicado');
  }

  console.log(
    changes === 0
      ? '\nInventario consistente con el libro de movimientos.'
      : APPLY
        ? `\n${changes} pieza(s) reconciliada(s).`
        : `\n${changes} pieza(s) requieren ajuste. Ejecuta con --apply para aplicarlo.`
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
