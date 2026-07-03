import type { SupabaseClient } from '@supabase/supabase-js';

const SERIES_COLS =
  'id, serial_number, current_status, current_box_id, current_reception_id, service_order_id, model_id, brand_id, material, valuation, notes, sap_status, created_at';

function chunkIds<T>(ids: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

async function fetchMap(
  supabase: SupabaseClient,
  table: string,
  ids: string[],
  cols: string
) {
  const map = new Map<string, Record<string, unknown>>();
  if (!ids.length) return map;
  const results = await Promise.all(
    chunkIds(ids, 80).map((c) => supabase.from(table).select(cols).in('id', c))
  );
  for (const { data } of results) {
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    for (const row of rows) {
      const id = row.id;
      if (typeof id === 'string') map.set(id, row);
    }
  }
  return map;
}

/** Enriquece filas planas de `series` con receptions / service_orders / models (mismo patrón que warehouse.ts). */
export async function enrichBoxSeriesRows(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[]
) {
  if (!rows.length) return rows;

  const recIds = [...new Set(rows.map((s) => s.current_reception_id).filter(Boolean))] as string[];
  const osIds = [...new Set(rows.map((s) => s.service_order_id).filter(Boolean))] as string[];
  const modelIds = [...new Set(rows.map((s) => s.model_id).filter(Boolean))] as string[];

  const [recMap, osMap, modelMap] = await Promise.all([
    fetchMap(
      supabase,
      'receptions',
      recIds,
      'id, guide_number, notes, carrier, received_by, status, created_at, source'
    ),
    fetchMap(supabase, 'service_orders', osIds, 'id, os_label, reentry_count, sap_integration_status'),
    fetchMap(supabase, 'models', modelIds, 'id, name, technology_id, brand_id'),
  ]);

  return rows.map((s) => ({
    ...s,
    receptions: s.current_reception_id
      ? recMap.get(String(s.current_reception_id)) ?? null
      : null,
    service_orders: s.service_order_id ? osMap.get(String(s.service_order_id)) ?? null : null,
    models: s.model_id ? modelMap.get(String(s.model_id)) ?? null : null,
  }));
}

export { SERIES_COLS };
