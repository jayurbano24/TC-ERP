import type { SupabaseClient } from '@supabase/supabase-js';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';

/** IDs de series hermanas por orden de servicio (todas las ubicaciones). */
export async function fetchSiblingIdsByServiceOrder(
  supabase: SupabaseClient,
  osIds: string[]
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  const unique = [...new Set(osIds.filter(Boolean))];
  const chunkSize = BATCH_LIMITS.UUID_IN_CLAUSE;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('series')
      .select('id, service_order_id')
      .in('service_order_id', chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const os = String(row.service_order_id);
      if (!map.has(os)) map.set(os, new Set());
      map.get(os)!.add(String(row.id));
    }
  }
  return map;
}
