import type { WorkshopTabId } from '@/lib/database/workshop';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { apiFetch } from '@/lib/http/apiFetch';

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
  cursor?: string | null,
  search?: string
): Promise<WorkshopTasksPage> {
  const params = new URLSearchParams({
    tab,
    limit: String(BATCH_LIMITS.WORKSHOP_QUEUE_PAGE_OS),
  });
  if (cursor) params.set('cursor', cursor);
  if (search?.trim()) params.set('q', search.trim());

  const res = await apiFetch(`/api/v1/workshop/tasks?${params}`, { credentials: 'include' });
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

export type WorkshopLocateResult = {
  found: boolean;
  tab: WorkshopTabId | null;
  tabLabel: string | null;
  status: string | null;
  osLabel: string | null;
  serial: string | null;
  serviceOrderId: string | null;
};

export async function locateWorkshopEquipmentViaApi(
  query: string
): Promise<WorkshopLocateResult> {
  const params = new URLSearchParams({ q: query.trim() });
  const res = await apiFetch(`/api/v1/workshop/locate?${params}`, { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return data as WorkshopLocateResult;
}
