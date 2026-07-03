export async function fetchSeriesHistoryViaApi(
  recordIds: string | string[]
): Promise<any[]> {
  const ids = Array.isArray(recordIds) ? recordIds : [recordIds];
  const params = new URLSearchParams({ ids: ids.join(',') });
  const res = await fetch(`/api/v1/audit/series-history?${params}`, { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return (data.items ?? []) as any[];
}
