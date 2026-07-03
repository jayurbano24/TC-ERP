import type { SupabaseClient } from '@supabase/supabase-js';

export type SeriesHistoryEntry = {
  id: string;
  action: string;
  changed_at: string;
  payload: unknown;
  changed_by: string | null;
  profiles: { full_name: string } | null;
};

async function resolveProfileNames(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};

  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);

  if (!profilesData?.length) return {};

  const emailsToSearch = profilesData.map((p) => p.full_name).filter((n) => n?.includes('@'));
  let empMap: Record<string, string> = {};

  if (emailsToSearch.length > 0) {
    const { data: emps } = await supabase
      .from('employees')
      .select('email, nombre_completo')
      .in('email', emailsToSearch);
    if (emps) {
      empMap = emps.reduce((acc: Record<string, string>, e) => {
        if (e.email && e.nombre_completo) acc[e.email] = e.nombre_completo;
        return acc;
      }, {});
    }
  }

  return profilesData.reduce((acc: Record<string, string>, p) => {
    let name = p.full_name;
    if (name && name.includes('@')) {
      name = empMap[name] ?? name.split('@')[0];
    }
    acc[p.id] = name ?? 'SISTEMA';
    return acc;
  }, {});
}

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
  const profiles = await resolveProfileNames(supabase, userIds);

  return data.map((d) => ({
    id: d.id as string,
    action: d.action as string,
    changed_at: d.created_at as string,
    payload: d.new_values,
    changed_by: (d.user_id as string | null) ?? null,
    profiles: d.user_id
      ? { full_name: profiles[d.user_id as string] || 'SISTEMA' }
      : null,
  }));
}
