import type { SupabaseClient } from '@supabase/supabase-js';
import { BRAND_SELECT, MODEL_SELECT, TECHNOLOGY_SELECT } from '@/shared/constants/dbProjections';

export type WarehouseBoxListRow = {
  box_id: string;
  rack?: string | null;
  label?: string | null;
  series_count?: number;
  sample_status?: string | null;
  sample_brand_id?: string | null;
  sample_model_id?: string | null;
  sample_service_order_id?: string | null;
  last_movement_at?: string | null;
};

export type EnrichedWarehouseBoxRow = WarehouseBoxListRow & {
  capacity?: number | null;
  created_at?: string | null;
  brand_name?: string | null;
  model_name?: string | null;
  tech_name?: string | null;
  technology_id?: string | null;
};

async function fetchMapById(
  supabase: SupabaseClient,
  table: string,
  ids: string[],
  cols: string
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  if (ids.length === 0) return map;

  const chunkSize = 80;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase.from(table).select(cols).in('id', chunk);
    if (error) {
      console.error(`[warehouse] batch ${table}:`, error.message);
      continue;
    }
    for (const row of data ?? []) {
      map.set(String((row as { id: string }).id), row as Record<string, unknown>);
    }
  }
  return map;
}

/** Enriquece filas de warehouse_list_boxes_page con nombres y metadatos de caja. */
export async function enrichWarehouseBoxItems(
  supabase: SupabaseClient,
  items: WarehouseBoxListRow[]
): Promise<EnrichedWarehouseBoxRow[]> {
  if (items.length === 0) return [];

  const boxIds = [...new Set(items.map((i) => i.box_id).filter(Boolean))];
  const brandIds = [...new Set(items.map((i) => i.sample_brand_id).filter(Boolean) as string[])];
  const modelIds = [...new Set(items.map((i) => i.sample_model_id).filter(Boolean) as string[])];

  const [boxMetaMap, brandMap, modelMap] = await Promise.all([
    fetchMapById(supabase, 'boxes', boxIds, 'id, capacity, created_at'),
    fetchMapById(supabase, 'brands', brandIds, BRAND_SELECT),
    fetchMapById(supabase, 'models', modelIds, MODEL_SELECT),
  ]);

  const techIds = [
    ...new Set(
      [...modelMap.values()]
        .map((m) => m.technology_id as string | undefined)
        .filter(Boolean) as string[]
    ),
  ];
  const techMap = await fetchMapById(supabase, 'technologies', techIds, TECHNOLOGY_SELECT);

  return items.map((item) => {
    const boxMeta = boxMetaMap.get(item.box_id);
    const brand = item.sample_brand_id ? brandMap.get(item.sample_brand_id) : undefined;
    const model = item.sample_model_id ? modelMap.get(item.sample_model_id) : undefined;
    const techId = (model?.technology_id as string | undefined) ?? null;
    const tech = techId ? techMap.get(techId) : undefined;

    return {
      ...item,
      capacity: (boxMeta?.capacity as number | undefined) ?? null,
      created_at: (boxMeta?.created_at as string | undefined) ?? null,
      brand_name: (brand?.name as string | undefined) ?? null,
      model_name: (model?.name as string | undefined) ?? null,
      tech_name: (tech?.name as string | undefined) ?? null,
      technology_id: techId,
    };
  });
}
