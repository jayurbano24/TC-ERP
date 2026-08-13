import type { WorkshopTabId } from '@/lib/database/workshop';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { apiFetch } from '@/lib/http/apiFetch';
import { parseWorkshopSearchTokens } from '@/modules/workshop/shared/workshopSearch';

export type WorkshopTasksPage = {
  items: any[];
  nextCursor: string | null;
  totalOs: number | null;
  searchTruncated?: boolean;
  searchTotal?: number;
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

  let searchTruncated = false;
  let searchTotal = 0;
  if (search?.trim()) {
    const parsed = parseWorkshopSearchTokens(search);
    searchTruncated = parsed.truncated;
    searchTotal = parsed.total;
    if (parsed.tokens.length > 0) {
      params.set('q', parsed.tokens.join('\n'));
    }
  }

  const res = await apiFetch(`/api/v1/workshop/tasks?${params}`, { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return {
    items: (data.items ?? []) as any[],
    nextCursor: data.nextCursor ?? null,
    totalOs: data.totalOs ?? null,
    searchTruncated,
    searchTotal,
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
  /** Stock en Bodega Central sin paso por Taller (no es Equipo Listo). */
  outsideWorkshop?: boolean;
  locationLabel?: string | null;
  message?: string | null;
  boxCode?: string | null;
  rack?: string | null;
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

export type ScrapDispatchResult = {
  success: true;
  box_id: string;
  box_code: string;
  linked: number;
  capacity: number;
};

/** Confirma despacho SCRAP: crea caja en Bodega SCRAPS y vincula series. */
export async function scrapDispatchViaApi(input: {
  seriesIds: string[];
  brandId: string;
  modelId: string;
  capacity: number;
  conduce: string;
  notes?: string;
}): Promise<ScrapDispatchResult> {
  const res = await apiFetch('/api/v1/workshop/scrap-dispatch', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      series_ids: input.seriesIds,
      brand_id: input.brandId,
      model_id: input.modelId,
      capacity: input.capacity,
      conduce: input.conduce,
      notes: input.notes ?? '',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return data as ScrapDispatchResult;
}
