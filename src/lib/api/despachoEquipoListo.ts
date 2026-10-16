import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { apiFetch } from '@/lib/http/apiFetch';
import { parseWorkshopSearchTokens } from '@/modules/workshop/shared/workshopSearch';

export type DespachoEquipoListoTechStat = {
  technology_id: string | null;
  tech_name: string;
  total_os: number;
};

export type DespachoEquipoListoPage = {
  items: DespachoEquipoListoRow[];
  nextCursor: string | null;
  totalOs: number | null;
  byTechnology?: DespachoEquipoListoTechStat[];
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
  limit?: number;
}): Promise<DespachoEquipoListoPage> {
  const params = new URLSearchParams({
    limit: String(opts?.limit ?? BATCH_LIMITS.WORKSHOP_QUEUE_PAGE_OS),
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
  const data = await parseEquipoListoJson(res);
  if (!res.ok) {
    throw new Error(
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error?: string }).error)
        : typeof data === 'object' && data && 'detail' in data
          ? String((data as { detail?: string }).detail)
          : `HTTP ${res.status}`,
    );
  }

  return {
    items: (data.items ?? []) as DespachoEquipoListoRow[],
    nextCursor:
      typeof data.nextCursor === 'string'
        ? data.nextCursor
        : data.nextCursor == null
          ? null
          : String(data.nextCursor),
    totalOs:
      typeof data.totalOs === 'number'
        ? data.totalOs
        : data.totalOs == null
          ? null
          : Number(data.totalOs),
    byTechnology: Array.isArray(data.byTechnology)
      ? (data.byTechnology as DespachoEquipoListoTechStat[])
      : [],
    searchTruncated,
  };
}

async function parseEquipoListoJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error('Respuesta JSON inesperada del servidor.');
  } catch (err) {
    if (err instanceof Error && err.message === 'Respuesta JSON inesperada del servidor.') throw err;
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!res.ok) {
      throw new Error(
        snippet.startsWith('<')
          ? `El servidor devolvió un error (${res.status}). La cola es muy grande para una sola petición; use exportación por páginas.`
          : snippet || `HTTP ${res.status}`,
      );
    }
    throw new Error('No se pudo leer la respuesta del servidor (JSON inválido).');
  }
}

/** Descarga toda la cola Equipo Listo paginando (evita ?all=1 y respuestas > límite Vercel). */
export async function fetchAllDespachoEquipoListo(): Promise<DespachoEquipoListoRow[]> {
  const seen = new Set<string>();
  const items: DespachoEquipoListoRow[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 250; page++) {
    const chunk = await fetchDespachoEquipoListoPage({
      cursor,
      limit: BATCH_LIMITS.API_PAGE_MAX,
    });
    for (const row of chunk.items) {
      const key = String(row.service_order_id || row.id);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(row);
    }
    if (!chunk.nextCursor || chunk.items.length === 0) break;
    cursor = chunk.nextCursor;
  }

  return items;
}
