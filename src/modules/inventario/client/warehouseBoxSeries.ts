import { groupSeriesToUiRows } from './warehouseSeriesUi';

/** Descarga todas las series de una caja (paginación cursor) vía API V2. */
export async function fetchAllBoxSeries(boxId: string): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | null = null;

  for (;;) {
    const url = new URL(`/api/v1/warehouse/boxes/${boxId}/series`, window.location.origin);
    if (cursor) url.searchParams.set('cursor', cursor);
    url.searchParams.set('limit', '100');

    const res = await fetch(url.toString(), { credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || 'No se pudieron cargar las series de la caja');
    }
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
