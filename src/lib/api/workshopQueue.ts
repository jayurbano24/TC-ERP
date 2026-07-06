import { apiFetch } from '@/lib/http/apiFetch';

export type WorkshopQueueItem = {
  service_order_id: string;
  os_label: string;
  series_count: number;
  sample_serial: string;
  last_updated: string;
};

export type WorkshopQueueResponse = {
  items: WorkshopQueueItem[];
  totalOs: number | null;
  nextCursor: string | null;
};

export async function fetchWorkshopQueuePage(
  tab: string,
  cursor?: string | null
): Promise<WorkshopQueueResponse> {
  const params = new URLSearchParams({ tab, limit: '50' });
  if (cursor) params.set('cursor', cursor);

  const res = await apiFetch(`/api/v1/workshop/queue?${params}`, { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return data as WorkshopQueueResponse;
}

export async function fetchWorkshopCountsViaApi(): Promise<Record<string, number>> {
  const res = await apiFetch('/api/v1/workshop/counts', { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return (data.counts ?? {}) as Record<string, number>;
}
