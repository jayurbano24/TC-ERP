import type { SupabaseClient } from '@supabase/supabase-js';
import { countOutboundEquipmentsLikeDetail } from '@/lib/api/outboundBoxEquipmentCount';
import { fetchSiblingIdsByServiceOrder } from '@/lib/api/outboundBoxSiblingIds';

const WAREHOUSE_SERIES_STATUSES = ['in_central_warehouse', 'in_control_warehouse'] as const;

type SeriesPick = {
  id: string;
  service_order_id: string | null;
  current_box_id: string | null;
};

export type WarehouseBoxCountRow = {
  box_id: string;
  capacity?: number | null;
  equipos_count?: number | null;
  series_count?: number | null;
  rack?: string | null;
  label?: string | null;
};

/** Pistoleo TMP / EN_PROCESO (aún no cerrada en stock). */
export function isWarehouseScanInProgress(
  rack?: string | null,
  label?: string | null
): boolean {
  const r = String(rack || '').trim().toUpperCase();
  const code = String(label || '').trim().toUpperCase();
  return r === 'EN_PROCESO' || code.startsWith('TMP-');
}

export type ResolveBoxListCapacityOptions = {
  /** true = barra hacia capacidad objetivo; false/omit = stock cerrado → capacity = equipos. */
  inProgress?: boolean;
};

/**
 * Capacidad de listado:
 * - En proceso (TMP): conserva capacidad declarada (p. ej. 10/60).
 * - Stock en rack operativo: capacity = equipos (caja cerrada = completa).
 */
export function resolveBoxListCapacity(
  equiposCount: number,
  declaredCapacity: number,
  options?: ResolveBoxListCapacityOptions
): number {
  const equipos = Math.max(0, Number(equiposCount) || 0);
  const declared = Number(declaredCapacity || 0);
  if (equipos <= 0) return declared;

  if (options?.inProgress) {
    if (declared <= 0) return Math.max(equipos, 1);
    return Math.max(declared, equipos);
  }

  // Stock cerrado (BODEGA_CENTRAL / P-01 / …): no dejar 18/19 como «parcial».
  return Math.max(equipos, 1);
}

/**
 * Recalcula equipos por caja (excluye hermanas huérfanas) y alinea capacity de listado.
 */
export async function applyAccurateEquiposToWarehouseBoxItems<T extends WarehouseBoxCountRow>(
  db: SupabaseClient,
  items: T[]
): Promise<T[]> {
  if (items.length === 0) return items;

  const boxIds = items.map((i) => String(i.box_id)).filter(Boolean);
  const rowsByBox = new Map<string, SeriesPick[]>();
  for (const id of boxIds) rowsByBox.set(id, []);

  let from = 0;
  for (let guard = 0; guard < 500; guard += 1) {
    const { data, error } = await db
      .from('series')
      .select('id, service_order_id, current_box_id')
      .in('current_box_id', boxIds)
      .in('current_status', [...WAREHOUSE_SERIES_STATUSES])
      .range(from, from + 999);
    if (error) throw error;
    const chunk = (data ?? []) as SeriesPick[];
    for (const row of chunk) {
      const boxId = String(row.current_box_id);
      const list = rowsByBox.get(boxId);
      if (list) list.push(row);
    }
    if (chunk.length < 1000) break;
    from += 1000;
  }

  const allOsIds: string[] = [];
  for (const rows of rowsByBox.values()) {
    for (const r of rows) {
      if (r.service_order_id) allOsIds.push(String(r.service_order_id));
    }
  }
  const siblingIdsByOs = await fetchSiblingIdsByServiceOrder(db, allOsIds);

  return items.map((item) => {
    const boxId = String(item.box_id);
    const rows = rowsByBox.get(boxId) ?? [];
    const equipos = countOutboundEquipmentsLikeDetail(rows, siblingIdsByOs);
    const declared = Number(item.capacity ?? 0);
    const inProgress = isWarehouseScanInProgress(item.rack, item.label);
    const displayCapacity = resolveBoxListCapacity(equipos, declared, { inProgress });
    return {
      ...item,
      equipos_count: equipos,
      series_count: rows.length,
      capacity: displayCapacity,
    };
  });
}
