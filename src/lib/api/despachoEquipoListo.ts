import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { apiFetch } from '@/lib/http/apiFetch';
import { parseWorkshopSearchTokens } from '@/modules/workshop/shared/workshopSearch';

export type DespachoEquipoListoPage = {
  items: DespachoEquipoListoRow[];
  nextCursor: string | null;
  totalOs: number | null;
  searchTruncated?: boolean;
};

export type DespachoEquipoListoRow = {
  id: string;
  service_order_id?: string | null;
  serial_number?: string | null;
  all_sns?: string[];
  all_dbIds?: string[];
  current_status?: string;
  updated_at?: string | null;
  brands?: { name?: string } | null;
  models?: { name?: string; technologies?: { name?: string } | null } | null;
  boxes?: { box_code?: string } | null;
  source_box_code?: string | null;
  service_orders?: { os_label?: string } | null;
  material?: string | null;
  valuation?: string | null;
};

export async function fetchDespachoEquipoListoPage(opts?: {
  cursor?: string | null;
  search?: string;
}): Promise<DespachoEquipoListoPage> {
  const params = new URLSearchParams({
    limit: String(BATCH_LIMITS.WORKSHOP_QUEUE_PAGE_OS),
  });
  if (opts?.cursor) params.set('cursor', opts.cursor);

  let searchTruncated = false;
  if (opts?.search?.trim()) {
    const parsed = parseWorkshopSearchTokens(opts.search);
    searchTruncated = parsed.truncated;
    if (parsed.tokens.length > 0) {
      params.set('q', parsed.tokens.join('\n'));
    }
  }

  const res = await apiFetch(`/api/v1/despacho/equipo-listo?${params}`, {
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }

  return {
    items: (data.items ?? []) as DespachoEquipoListoRow[],
    nextCursor: data.nextCursor ?? null,
    totalOs: data.totalOs ?? null,
    searchTruncated,
  };
}
