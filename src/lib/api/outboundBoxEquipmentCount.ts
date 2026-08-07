/** Fila de `series` asignada a una caja outbound. */
export type OutboundBoxSeriesRow = {
  id: string;
  service_order_id?: string | null;
  updated_at?: string | null;
};

function sortByUpdatedAtDesc(rows: OutboundBoxSeriesRow[]): OutboundBoxSeriesRow[] {
  return [...rows].sort((a, b) => {
    const ta = new Date(a.updated_at ?? 0).getTime();
    const tb = new Date(b.updated_at ?? 0).getTime();
    return tb - ta;
  });
}

/**
 * Conteo idéntico al detalle `/despacho/boxes/[id]/items` (filas enriquecidas).
 * Excluye series huérfanas (sin OS) que son hermanas de un OS ya presente en la caja.
 */
export function countOutboundEquipmentsLikeDetail(
  rows: OutboundBoxSeriesRow[],
  siblingIdsByOs: ReadonlyMap<string, ReadonlySet<string>>
): number {
  const sorted = sortByUpdatedAtDesc(rows);
  const processedOs = new Set<string>();
  const osInBox = new Set(
    sorted
      .map((r) => (r.service_order_id ? String(r.service_order_id) : null))
      .filter(Boolean) as string[]
  );

  let count = 0;
  for (const item of sorted) {
    const osId = item.service_order_id ? String(item.service_order_id) : null;
    if (osId && processedOs.has(osId)) continue;

    if (!osId) {
      let siblingOfOsInBox = false;
      for (const oid of osInBox) {
        if (siblingIdsByOs.get(oid)?.has(item.id)) {
          siblingOfOsInBox = true;
          break;
        }
      }
      if (siblingOfOsInBox) continue;
    }

    if (osId) processedOs.add(osId);
    count += 1;
  }
  return count;
}

/** @deprecated Usar countOutboundEquipmentsLikeDetail cuando exista mapa de hermanas. */
export function countOutboundEquipmentsInBox(rows: OutboundBoxSeriesRow[]): number {
  const processedOs = new Set<string>();
  let count = 0;
  for (const row of rows) {
    const osId = row.service_order_id ? String(row.service_order_id) : null;
    if (osId) {
      if (processedOs.has(osId)) continue;
      processedOs.add(osId);
    }
    count += 1;
  }
  return count;
}
