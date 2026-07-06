import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveProfileDisplayNames } from '@/shared/infrastructure/profiles/resolveProfileDisplayNames';

export type SeriesHistoryEntry = {
  id: string;
  action: string;
  changed_at: string;
  payload: unknown;
  changed_by: string | null;
  profiles: { full_name: string } | null;
};

/** Historial de auditoría para una o varias series (record_id = series.id como texto). */
export async function querySeriesHistory(
  supabase: SupabaseClient,
  recordIds: string[]
): Promise<SeriesHistoryEntry[]> {
  const ids = [...new Set(recordIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('erp_audit_logs')
    .select('id, action, created_at, new_values, user_id')
    .in('record_id', ids)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data?.length) return [];

  const userIds = Array.from(new Set(data.map((d) => d.user_id).filter(Boolean))) as string[];
  const profiles = await resolveProfileDisplayNames(userIds);

  return data.map((d) => {
    const payload = (d.new_values || {}) as Record<string, unknown>;
    const payloadName =
      typeof payload.operator_name === 'string' ? payload.operator_name.trim() : '';
    const userId = d.user_id as string | null;
    const resolvedName = (userId && profiles[userId]) || payloadName || '';

    return {
      id: d.id as string,
      action: d.action as string,
      changed_at: d.created_at as string,
      payload: d.new_values,
      changed_by: userId,
      profiles: resolvedName ? { full_name: resolvedName } : userId ? { full_name: 'SISTEMA' } : null,
    };
  });
}
