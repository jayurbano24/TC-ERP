import type { DespachoHistoryRow } from '@/lib/api/despachoReads';

/** Fila de historial ya agrupada por el mismo Nº Conduce (guide_number). */
export type DespachoHistoryGroup = DespachoHistoryRow & {
  /** IDs de cada `dispatches` que comparten el mismo conduce. */
  memberIds: string[];
  /** Códigos de caja Outbound del grupo. */
  box_codes: string[];
  /** Series asociadas (para búsqueda). */
  series_numbers: string[];
  /** Cantidad de cajas en el grupo. */
  box_count: number;
};

function normalizeKey(guide: string | null | undefined, fallbackId: string): string {
  const g = String(guide || '').trim().toUpperCase();
  return g || `id:${fallbackId}`;
}

/**
 * Agrupa filas del mismo despacho (mismo guide_number / NS-…).
 * Sin conduce, cada fila queda como grupo de 1.
 */
export function groupDespachoHistory(rows: DespachoHistoryRow[]): DespachoHistoryGroup[] {
  const map = new Map<string, DespachoHistoryRow[]>();

  for (const row of rows) {
    const key = normalizeKey(row.guide_number, row.id);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }

  const groups: DespachoHistoryGroup[] = [];

  for (const members of map.values()) {
    const sorted = [...members].sort((a, b) => {
      const ta = new Date(a.dispatched_at || a.created_at || 0).getTime();
      const tb = new Date(b.dispatched_at || b.created_at || 0).getTime();
      return tb - ta;
    });
    const primary = sorted[0]!;
    const boxCodes = [
      ...new Set(
        sorted
          .map((m) => String(m.box_code || '').trim())
          .filter(Boolean)
      ),
    ];
    const seriesSet = new Set<string>();
    for (const m of sorted) {
      const extra = m.series_numbers;
      if (!Array.isArray(extra)) continue;
      for (const sn of extra) {
        const u = String(sn || '').trim().toUpperCase();
        if (u) seriesSet.add(u);
      }
    }
    const seriesNumbers = [...seriesSet];

    const equipos = sorted.reduce(
      (sum, m) => sum + Number(m.equipos_count ?? m.dispatch_items?.[0]?.count ?? 0),
      0
    );

    const latestAt = sorted.reduce((best, m) => {
      const t = m.dispatched_at || m.created_at || '';
      return !best || String(t) > String(best) ? t : best;
    }, primary.dispatched_at || primary.created_at || '');

    groups.push({
      ...primary,
      id: primary.id,
      guide_number: primary.guide_number,
      dispatched_at: latestAt || primary.dispatched_at,
      created_at: latestAt || primary.created_at,
      equipos_count: equipos,
      memberIds: sorted.map((m) => m.id),
      box_codes: boxCodes,
      box_count: boxCodes.length || sorted.length,
      series_numbers: seriesNumbers,
      box_code: boxCodes[0] ?? primary.box_code ?? null,
    });
  }

  groups.sort((a, b) => {
    const ta = new Date(a.dispatched_at || a.created_at || 0).getTime();
    const tb = new Date(b.dispatched_at || b.created_at || 0).getTime();
    return tb - ta;
  });

  return groups;
}

/**
 * Filtra grupos por Nº conduce, código de caja o número de serie.
 */
export function filterDespachoHistoryGroups(
  groups: DespachoHistoryGroup[],
  rawQuery: string
): DespachoHistoryGroup[] {
  const term = rawQuery.trim().toLowerCase();
  if (!term) return groups;

  const compactNs = term.replace(/^ns-/, '').replace(/^0+/, '');
  const compactOb = term.replace(/^(ob|mb|cs|box)-/, '').replace(/^0+/, '');

  return groups.filter((g) => {
    const guide = String(g.guide_number || '').toLowerCase();
    if (guide.includes(term)) return true;
    if (compactNs && guide.replace(/^ns-/, '').replace(/^0+/, '').includes(compactNs)) return true;

    const notes = String(g.notes || '').toLowerCase();
    if (notes.includes(term)) return true;

    for (const code of g.box_codes) {
      const c = code.toLowerCase();
      if (c.includes(term)) return true;
      if (compactOb && c.replace(/^(ob|mb|cs)-/, '').replace(/^0+/, '').includes(compactOb)) {
        return true;
      }
    }

    for (const sn of g.series_numbers) {
      if (sn.toLowerCase().includes(term)) return true;
    }

    return false;
  });
}
