import { apiFetch, readApiJson } from '@/lib/http/apiFetch';
import { groupSeriesToUiRows } from './warehouseSeriesUi';
import { buildEquipmentSerialSlots } from '@/lib/sap/equipmentSerialSlots';

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

async function fetchOsSiblingRows(osIds: string[]): Promise<any[]> {
  if (osIds.length === 0) return [];
  try {
    const res = await apiFetch('/api/v1/warehouse/series/by-os', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ os_ids: osIds }),
    });
    const data = await readApiJson<{ items?: any[] }>(res);
    return data.items || [];
  } catch (err) {
    console.warn('[warehouseBoxSeries] fetchOsSiblingRows:', err);
    return [];
  }
}

/**
 * Una fila UI = un equipo con ≥1 serie en la caja.
 * Las hermanas fuera de caja SOLO rellenan S1–S4; nunca crean filas extra.
 */
export async function fetchBoxSeriesUi(boxId: string): Promise<any[]> {
  const raw = await fetchAllBoxSeries(boxId);
  if (raw.length === 0) return [];

  // Filas = solo series vinculadas a la caja (conteo = listado).
  const rows = groupSeriesToUiRows(raw);

  const osIds = [
    ...new Set(
      raw
        .map((s) => s?.service_order_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ];
  if (osIds.length === 0) return rows;

  const siblings = await fetchOsSiblingRows(osIds);
  if (siblings.length === 0) return rows;

  const siblingsByOs = new Map<string, any[]>();
  for (const s of siblings) {
    const os = String(s.service_order_id || '');
    if (!os) continue;
    const list = siblingsByOs.get(os) || [];
    list.push(s);
    siblingsByOs.set(os, list);
  }

  return rows.map((row) => {
    const osId = String(row.service_orders?.id || '');
    const extra = osId ? siblingsByOs.get(osId) || [] : [];
    if (extra.length === 0) return row;

    const pickRows = extra.map((g) => ({
      id: String(g.id),
      serial_number: g.serial_number,
      material: g.material,
      valuation: g.valuation,
      created_at: g.created_at,
      s2: g.s2,
      s3: g.s3,
      s4: g.s4,
    }));
    // Incluir S1 actual por si la hermana SAP no vino en raw.
    if (row.s1) {
      pickRows.unshift({
        id: `ui-${row.s1}`,
        serial_number: row.s1,
        material: row.material,
        valuation: row.lote,
        created_at: null,
        s2: row.s2,
        s3: row.s3,
        s4: row.s4,
      });
    }
    try {
      const mainSerial =
        row.service_orders?.main_serial ||
        row.service_orders?.main_serial_number ||
        null;
      const slots = buildEquipmentSerialSlots(pickRows, mainSerial);
      const material = slots.primary.material || row.material;
      const valuation = slots.primary.valuation || row.lote;
      return {
        ...row,
        s1: slots.s1 || row.s1,
        s2: slots.s2 || row.s2,
        s3: slots.s3 || row.s3,
        s4: slots.s4 || row.s4,
        sn: slots.s1 || row.sn,
        serial_number: slots.s1 || row.serial_number,
        allSeries: [slots.s1, slots.s2, slots.s3, slots.s4].filter(Boolean),
        material: material || row.material,
        lote: valuation || row.lote,
      };
    } catch {
      return row;
    }
  });
}
