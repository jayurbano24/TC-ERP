import { apiFetch } from '@/lib/http/apiFetch';

export async function fetchSeriesHistoryViaApi(
  recordIds: string | string[]
): Promise<any[]> {
  const ids = [...new Set((Array.isArray(recordIds) ? recordIds : [recordIds]).filter(Boolean))];
  if (ids.length === 0) return [];
  const params = new URLSearchParams({ ids: ids.join(',') });
  const res = await apiFetch(`/api/v1/audit/series-history?${params}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return (data.items ?? []) as any[];
}
