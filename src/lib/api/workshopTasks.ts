import type { WorkshopTabId } from '@/lib/database/workshop';

export async function fetchWorkshopTasksViaApi(tab: WorkshopTabId): Promise<any[]> {
  const params = new URLSearchParams({ tab });
  const res = await fetch(`/api/v1/workshop/tasks?${params}`, { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return (data.items ?? []) as any[];
}
