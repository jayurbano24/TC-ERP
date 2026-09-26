/**
 * workshop_list_listo_os_page (migración 248) recorta p_limit a 200.
 * El cliente pide limit+1 para saber si hay otra página; con tope 200
 * esa fila extra nunca llega y la cola se queda en las 200 OS más nuevas.
 */
export const LISTO_OS_PAGE_SQL_CAP = 200;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseListoOsCursor(raw: string | null | undefined): {
  ts: string | null;
  id: string | null;
} {
  const value = raw?.trim() ?? '';
  if (!value) return { ts: null, id: null };
  const sep = value.indexOf('|');
  if (sep === -1) return { ts: value, id: null };
  const ts = value.slice(0, sep).trim();
  const id = value.slice(sep + 1).trim();
  return {
    ts: ts || null,
    id: UUID_RE.test(id) ? id : null,
  };
}

export function formatListoOsCursor(sortTs: string, serviceOrderId: string): string {
  return `${sortTs}|${serviceOrderId}`;
}

export function sliceListoOsPage<T>(
  rows: T[],
  requestedLimit: number
): { page: T[]; hasMore: boolean } {
  if (rows.length > requestedLimit) {
    return { page: rows.slice(0, requestedLimit), hasMore: true };
  }
  const saturated =
    requestedLimit >= LISTO_OS_PAGE_SQL_CAP && rows.length >= LISTO_OS_PAGE_SQL_CAP;
  return { page: rows, hasMore: saturated };
}
