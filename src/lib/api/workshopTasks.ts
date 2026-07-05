import type { WorkshopTabId } from '@/lib/database/workshop';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';

export type WorkshopTasksPage = {
  items: any[];
  nextCursor: string | null;
  totalOs: number | null;
};

export async function fetchWorkshopTasksViaApi(tab: WorkshopTabId): Promise<any[]> {
  const page = await fetchWorkshopTasksPageViaApi(tab);
  return page.items;
}

export async function fetchWorkshopTasksPageViaApi(
  tab: WorkshopTabId,
  cursor?: string | null
): Promise<WorkshopTasksPage> {
  const params = new URLSearchParams({
    tab,
    limit: String(BATCH_LIMITS.WORKSHOP_QUEUE_PAGE_OS),
  });
  if (cursor) params.set('cursor', cursor);

  const res = await fetch(`/api/v1/workshop/tasks?${params}`, { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return {
    items: (data.items ?? []) as any[],
    nextCursor: data.nextCursor ?? null,
    totalOs: data.totalOs ?? null,
  };
}
