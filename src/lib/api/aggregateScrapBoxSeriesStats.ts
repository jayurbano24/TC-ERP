import type { SupabaseClient } from '@supabase/supabase-js';

export type ScrapBoxSeriesStats = {
  seriesCount: number;
  equiposCount: number;
  sampleBrandId: string | null;
  sampleModelId: string | null;
  sampleServiceOrderId: string | null;
};

type SeriesPick = {
  id: string;
  current_box_id: string;
  brand_id: string | null;
  model_id: string | null;
  service_order_id: string | null;
};

/** PostgREST: `.in(current_box_id)` con muchas UUID + range inestable subcuenta equipos. */
const BOX_CHUNK = 20;
const SERIES_PAGE = 500;

/**
 * Cuenta series y equipos (OS distintas) por caja SCRAPS.
 * Misma unidad que el detalle: 1 fila UI ≈ 1 OS con ≥1 serie en la caja.
 */
export async function aggregateScrapBoxSeriesStats(
  supabase: SupabaseClient,
  boxIds: string[]
): Promise<Map<string, ScrapBoxSeriesStats>> {
  const statsByBox = new Map<string, ScrapBoxSeriesStats>();
  for (const id of boxIds) {
    statsByBox.set(id, {
      seriesCount: 0,
      equiposCount: 0,
      sampleBrandId: null,
      sampleModelId: null,
      sampleServiceOrderId: null,
    });
  }
  if (boxIds.length === 0) return statsByBox;

  const osByBox = new Map<string, Set<string>>();
  for (const id of boxIds) osByBox.set(id, new Set());

  for (let bi = 0; bi < boxIds.length; bi += BOX_CHUNK) {
    const boxChunk = boxIds.slice(bi, bi + BOX_CHUNK);
    let cursorId: string | undefined;

    for (let guard = 0; guard < 500; guard += 1) {
      let q = supabase
        .from('series')
        .select('id, current_box_id, brand_id, model_id, service_order_id')
        .in('current_box_id', boxChunk)
        .order('id', { ascending: true })
        .limit(SERIES_PAGE + 1);

      if (cursorId) q = q.gt('id', cursorId);

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data || []) as SeriesPick[];
      const page = rows.slice(0, SERIES_PAGE);
      const hasMore = rows.length > SERIES_PAGE;

      for (const row of page) {
        const boxId = String(row.current_box_id || '');
        if (!boxId || !statsByBox.has(boxId)) continue;
        const st = statsByBox.get(boxId)!;
        st.seriesCount += 1;
        if (!st.sampleBrandId && row.brand_id) st.sampleBrandId = String(row.brand_id);
        if (!st.sampleModelId && row.model_id) st.sampleModelId = String(row.model_id);
        if (!st.sampleServiceOrderId && row.service_order_id) {
          st.sampleServiceOrderId = String(row.service_order_id);
        }
        osByBox.get(boxId)!.add(String(row.service_order_id || row.id));
      }

      if (page.length === 0) break;
      cursorId = String(page[page.length - 1].id);
      if (!hasMore) break;
    }
  }

  for (const [boxId, osSet] of osByBox) {
    const st = statsByBox.get(boxId);
    if (st) st.equiposCount = osSet.size;
  }

  return statsByBox;
}
