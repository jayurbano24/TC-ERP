import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE = 1000;
const MAX_ROWS = 120_000;

async function rpcCount(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<number | null> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    // RPC aún no desplegado → fallback pageo
    if (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      /function|does not exist/i.test(error.message || '')
    ) {
      return null;
    }
    console.warn(`[countDistinctOs] rpc ${fn}:`, error.code || error.message);
    return null;
  }
  return Number(data ?? 0);
}

/** Cuenta OS distintos por status — RPC primero, pageo solo como fallback. */
export async function countDistinctOsByStatus(
  supabase: SupabaseClient,
  status: string
): Promise<number> {
  const viaRpc = await rpcCount(supabase, 'count_os_by_status', { p_status: status });
  if (viaRpc != null) return viaRpc;

  const ids = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('series')
      .select('service_order_id')
      .eq('current_status', status)
      .not('service_order_id', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.warn(`[countDistinctOs] ${status}:`, error.code || error.message);
      break;
    }
    if (!data?.length) break;
    for (const row of data) {
      if (row.service_order_id) ids.add(row.service_order_id as string);
    }
    offset += data.length;
    if (data.length < PAGE || offset > MAX_ROWS) break;
  }
  return ids.size;
}

export async function countDistinctOsInStatuses(
  supabase: SupabaseClient,
  statuses: string[]
): Promise<number> {
  const viaRpc = await rpcCount(supabase, 'count_os_in_statuses', { p_statuses: statuses });
  if (viaRpc != null) return viaRpc;

  const ids = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('series')
      .select('service_order_id')
      .in('current_status', statuses)
      .not('service_order_id', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.warn('[countDistinctOs] multi:', error.code || error.message);
      break;
    }
    if (!data?.length) break;
    for (const row of data) {
      if (row.service_order_id) ids.add(row.service_order_id as string);
    }
    offset += data.length;
    if (data.length < PAGE || offset > MAX_ROWS) break;
  }
  return ids.size;
}

/**
 * OS en bandeja CAC activa (`cac_tray_units`), excluyendo devoluciones.
 * SSOT del módulo Backoffice / historial (sin filtro de fechas).
 */
export async function countCacTrayOsInStatuses(
  supabase: SupabaseClient,
  statuses: string[]
): Promise<number> {
  if (statuses.length === 0) return 0;

  const ids = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('cac_tray_units')
      .select('service_order_id')
      .eq('is_active', true)
      .in('unit_status', statuses)
      .not('unit_status', 'in', '("returned","DEVUELTO_BLOQUE","DEVUELTO")')
      .not('service_order_id', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.warn('[countCacTrayOsInStatuses]', error.code || error.message);
      // Fallback: series con esos status (misma unidad OS).
      return countDistinctOsInStatuses(supabase, statuses);
    }
    if (!data?.length) break;
    for (const row of data) {
      if (row.service_order_id) ids.add(row.service_order_id as string);
    }
    offset += data.length;
    if (data.length < PAGE || offset > MAX_ROWS) break;
  }
  return ids.size;
}

/**
 * OS en Detalle de Inventario (/bodega/inventario) — no status crudo de series.
 */
export async function countInventoryDetailOs(supabase: SupabaseClient): Promise<number> {
  const viaRpc = await rpcCount(supabase, 'count_inventory_detail_os', {});
  if (viaRpc != null) return viaRpc;

  // Fallback alineado a getInventoryDetails (más lento)
  const { data: warehouseBoxes, error: boxError } = await supabase
    .from('boxes')
    .select('id, rack_location')
    .not('rack_location', 'in', '("DESPACHO","ELIMINADO")')
    .not('rack_location', 'ilike', 'TALLER%');

  if (boxError || !warehouseBoxes?.length) {
    if (boxError) console.warn('[countInventoryDetailOs] boxes:', boxError.message);
    return countDistinctOsInStatuses(supabase, [
      'in_central_warehouse',
      'in_control_warehouse',
    ]);
  }

  const boxIds = warehouseBoxes
    .filter((b) => {
      const rack = String(b.rack_location || '').toUpperCase();
      return !rack.startsWith('SCRAP') && !rack.startsWith('OBSOLETO');
    })
    .map((b) => b.id as string);

  const ids = new Set<string>();
  for (let i = 0; i < boxIds.length; i += 80) {
    const chunk = boxIds.slice(i, i + 80);
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('series')
        .select('service_order_id')
        .in('current_box_id', chunk)
        .in('current_status', ['in_central_warehouse', 'in_control_warehouse'])
        .not('service_order_id', 'is', null)
        .range(offset, offset + PAGE - 1);
      if (error || !data?.length) break;
      for (const row of data) {
        if (row.service_order_id) ids.add(row.service_order_id as string);
      }
      if (data.length < PAGE) break;
      offset += data.length;
      if (offset > MAX_ROWS) break;
    }
  }
  return ids.size;
}
