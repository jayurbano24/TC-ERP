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

  const url = `/api/v1/workshop/tasks?${params}`;
  let res: Response;
  try {
    res = await apiFetch(url, { credentials: 'include' });
  } catch (err) {
    // HMR / reinicio de Next: un reintento corto evita toast "Failed to fetch" espurio.
    const msg = err instanceof Error ? err.message : String(err);
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 600));
      try {
        res = await apiFetch(url, { credentials: 'include' });
      } catch {
        throw new Error(
          'No se pudo conectar con la API de Taller. Recarga la página o reinicia el servidor (npm run dev).'
        );
      }
    } else {
      throw err;
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string; detail?: string }).error ??
        (data as { detail?: string }).detail ??
        `HTTP ${res.status}`
    );
  }
  return {
    items: ((data as WorkshopTasksPage).items ?? []) as any[],
    nextCursor: (data as WorkshopTasksPage).nextCursor ?? null,
    totalOs: (data as WorkshopTasksPage).totalOs ?? null,
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

/** Confirma ingreso a Bodega SCRAPS: crea caja BOX-N irrepetible y vincula series. */
export async function scrapDispatchViaApi(input: {
  seriesIds: string[];
  brandId: string;
  modelId: string;
  capacity: number;
  reference?: string;
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
      reference: input.reference ?? '',
      notes: input.notes ?? '',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const detail =
      typeof data.detail === 'string' && data.detail.trim()
        ? data.detail
        : null;
    throw new Error(detail || data.error || `HTTP ${res.status}`);
  }
  return data as ScrapDispatchResult;
}

export type ScrapAppendResult = {
  success: true;
  box_id: string;
  box_code: string;
  linked: number;
  equipos_count: number;
  capacity: number;
  closed: boolean;
  slots: { s1: string; s2: string; s3: string; s4: string };
  os_label: string | null;
};

/** Agrega un equipo (serie) a una caja SCRAPS parcial hasta completar capacidad. */
export async function scrapAppendSeriesViaApi(input: {
  boxId: string;
  seriesId?: string;
  serialNumber?: string;
}): Promise<ScrapAppendResult> {
  const res = await apiFetch('/api/v1/workshop/scrap-dispatch/append', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      box_id: input.boxId,
      series_id: input.seriesId,
      serial_number: input.serialNumber,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      (typeof data.detail === 'string' && data.detail.trim()) ||
        data.error ||
        `HTTP ${res.status}`
    );
  }
  return data as ScrapAppendResult;
}

export type ScrapCloseResult = {
  success: true;
  box_id: string;
  box_code: string;
  equipos_count: number;
  capacity: number;
  resized: boolean;
};

/** Cierra caja SCRAPS (Full). Con resize ajusta capacity = equipos actuales. */
export async function scrapCloseBoxViaApi(input: {
  boxId: string;
  resizeCapacityToContents?: boolean;
}): Promise<ScrapCloseResult> {
  const res = await apiFetch('/api/v1/workshop/scrap-dispatch/close', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      box_id: input.boxId,
      resize_capacity_to_contents: Boolean(input.resizeCapacityToContents),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      (typeof data.detail === 'string' && data.detail.trim()) ||
        data.error ||
        `HTTP ${res.status}`
    );
  }
  return data as ScrapCloseResult;
}

/** Comentario operativo sobre una OS / series (historial + notes). */
export async function addWorkshopCommentViaApi(input: {
  seriesIds: string[];
  comment: string;
  tab?: string;
}): Promise<{ processed: number }> {
  const res = await apiFetch('/api/v1/workshop/comments', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      series_ids: input.seriesIds,
      comment: input.comment,
      tab: input.tab,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return { processed: Number(data.processed ?? 0) };
}
