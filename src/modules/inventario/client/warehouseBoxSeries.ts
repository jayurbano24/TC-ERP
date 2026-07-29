import { apiFetch, readApiJson } from '@/lib/http/apiFetch';
import { groupSeriesToUiRows } from './warehouseSeriesUi';

/** Descarga todas las series de una caja (paginación cursor) vía API V2. */
export async function fetchAllBoxSeries(boxId: string): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | null = null;

  for (;;) {
    const url = new URL(`/api/v1/warehouse/boxes/${boxId}/series`, window.location.origin);
    if (cursor) url.searchParams.set('cursor', cursor);
    url.searchParams.set('limit', '100');

    const res = await apiFetch(url.toString());
    const data = await readApiJson<{ items?: unknown[]; nextCursor?: string | null }>(res);
    all.push(...(data.items || []));
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }

  return all;
}

/** Series agrupadas listas para DetalleCajaModal / despacho / validación SAP. */
export async function fetchBoxSeriesUi(boxId: string): Promise<any[]> {
  const raw = await fetchAllBoxSeries(boxId);
  return groupSeriesToUiRows(raw);
}
