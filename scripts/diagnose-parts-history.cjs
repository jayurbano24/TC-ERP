/**
 * Reconstruye el historial de una pieza para detectar descuentos sin despacho.
 * Uso: node --env-file=.env.local scripts/diagnose-parts-history.cjs <SKU>
 */
const { createClient } = require('@supabase/supabase-js');

const sku = (process.argv[2] || '').trim().toUpperCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

(async () => {
  const { data: part } = await db
    .from('parts_catalog')
    .select('id, sku, name')
    .eq('sku', sku)
    .maybeSingle();
  if (!part) {
    console.error(`No existe la pieza ${sku}`);
    process.exit(1);
  }

  const { data: movements } = await db
    .from('part_movements')
    .select('movement_type, qty, source_type, created_at, ref_type, ref_id')
    .eq('catalog_id', part.id)
    .order('created_at', { ascending: true });

  console.log(`\n== Movimientos de ${part.sku} (${part.name}) ==`);
  let net = 0;
  for (const m of movements || []) {
    const inbound = String(m.movement_type).startsWith('IN_');
    const outbound = m.movement_type === 'DISPATCH' || m.movement_type === 'OUT_ADJUST';
    if (inbound) net += Number(m.qty);
    if (outbound) net -= Number(m.qty);
    console.log(
      `${new Date(m.created_at).toLocaleString('es-GT')} ${m.movement_type} ${m.qty} ${m.source_type} (${m.ref_type || '-'})`
    );
  }
  console.log(`Saldo esperado según movimientos: ${net}`);

  const { data: inv } = await db
    .from('parts_inventory')
    .select('qty_on_hand, qty_new_on_hand, qty_recovered_on_hand, qty_reserved, qty_new_reserved, qty_recovered_reserved')
    .eq('catalog_id', part.id)
    .maybeSingle();
  console.log('Inventario actual:', inv);

  const { data: reservations } = await db
    .from('part_reservations')
    .select('id, qty, source_type, status, created_at, request_item_id')
    .eq('catalog_id', part.id)
    .order('created_at', { ascending: true });
  console.log('\n== Reservas ==');
  for (const r of reservations || []) {
    console.log(`${new Date(r.created_at).toLocaleString('es-GT')} ${r.status} ${r.source_type} qty=${r.qty} id=${r.id}`);
  }

  const { data: dispatchItems } = await db
    .from('part_dispatch_items')
    .select('id, qty, source_type, created_at, dispatch_id')
    .eq('catalog_id', part.id);
  console.log('\n== Ítems despachados ==', dispatchItems);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
