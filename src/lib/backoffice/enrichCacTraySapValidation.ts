import type { CacTrayUnitRow } from './cacTrayTypes';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeSerial } from '@/lib/sap/normalizeSerial';

function chunkIds<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

type LiveSeriesRow = {
  id: string;
  serial_number: string;
  service_order_id: string;
  sap_status: string | null;
  current_status: string | null;
};

/** Misma lógica que cac_tray_status_label (migración 056). */
export function formatCacTrayStatusLabel(status: string | null | undefined): string {
  const key = String(status || '')
    .trim()
    .toLowerCase();
  switch (key) {
    case 'recepcionado_bodega_general':
    case 'pendiente_ingreso_bodega':
      return 'Ingresado a Backoffice';
    case 'in_dispatch_warehouse':
      return 'Ingresado a Bodega Despacho';
    case 'in_central_warehouse':
    case 'ingresado_bodega':
      return 'Ingresado a Bodega General';
    case 'returned':
    case 'devuelto_bloque':
      return 'Devuelto';
    case 'dispatched':
    case 'despachado':
      return 'Despachado';
    default:
      return String(status || '').trim() || '---';
  }
}

/**
 * Prioridad operativa para Estatus en bandeja:
 * Bodega General > Backoffice > snapshot tray.
 */
function resolveLiveUnitStatus(
  series: LiveSeriesRow[],
  fallbackStatus: string
): string {
  if (series.length === 0) return fallbackStatus;

  const statuses = series.map((s) => String(s.current_status || '').trim());
  const lower = statuses.map((s) => s.toLowerCase());

  if (
    lower.length > 0 &&
    lower.every((s) => s === 'returned' || s === 'devuelto_bloque' || s === 'devuelto')
  ) {
    return 'returned';
  }
  if (lower.some((s) => s === 'in_dispatch_warehouse')) {
    return 'in_dispatch_warehouse';
  }
  if (lower.some((s) => s === 'in_central_warehouse' || s === 'ingresado_bodega')) {
    return 'in_central_warehouse';
  }
  // Si ninguna serie sigue en cola Backoffice, reflejar el estado operativo.
  const stillInQueue = lower.some(
    (s) =>
      s === 'recepcionado_bodega_general' ||
      s === 'pendiente_ingreso_bodega' ||
      s === 'in_validation'
  );
  if (!stillInQueue && lower.length > 0) {
    if (lower.every((s) => s === 'dispatched' || s === 'despachado')) return 'dispatched';
    if (lower.some((s) => s === 'irreparable')) return 'irreparable';
    if (lower.some((s) => s === 'in_qc')) return 'in_qc';
    if (lower.some((s) => s === 'in_workshop' || s === 'in_repair')) return 'in_workshop';
    if (lower.some((s) => s === 'in_control_warehouse')) return 'in_control_warehouse';
    return lower[0] || fallbackStatus;
  }
  if (lower.some((s) => s === 'recepcionado_bodega_general' || s === 'pendiente_ingreso_bodega')) {
    return 'RECEPCIONADO_BODEGA_GENERAL';
  }
  return fallbackStatus;
}

/**
 * Enriquece filas del tray con:
 * - sap_integration_status / series sap_status (live)
 * - unit_status / unit_status_label desde series.current_status (Bodega Central)
 *
 * No depende solo de series_ids del snapshot (pueden quedar viejos).
 */
export async function enrichCacTrayRowsWithSapValidation(
  rows: CacTrayUnitRow[]
): Promise<CacTrayUnitRow[]> {
  if (rows.length === 0) return rows;

  const supabase = getSupabaseServerClient();
  const osIds = [...new Set(rows.map((r) => r.service_order_id).filter(Boolean))];

  const orderStatusById = new Map<string, string | null>();
  const seriesByOs = new Map<string, LiveSeriesRow[]>();

  await Promise.all([
    ...chunkIds(osIds, 80).map(async (chunk) => {
      const { data, error } = await supabase
        .from('service_orders')
        .select('id, sap_integration_status')
        .in('id', chunk);
      if (error) throw new Error(error.message);
      for (const row of data || []) {
        orderStatusById.set(row.id, row.sap_integration_status ?? null);
      }
    }),
    ...chunkIds(osIds, 40).map(async (chunk) => {
      const { data, error } = await supabase
        .from('series')
        .select('id, serial_number, service_order_id, sap_status, current_status, brand_id')
        .in('service_order_id', chunk);
      if (error) throw new Error(error.message);
      for (const row of data || []) {
        // Misma regla del tray: series clasificadas (con marca)
        if (row.brand_id == null) continue;
        const live: LiveSeriesRow = {
          id: row.id,
          serial_number: row.serial_number,
          service_order_id: row.service_order_id,
          sap_status: row.sap_status ?? null,
          current_status: row.current_status ?? null,
        };
        if (!seriesByOs.has(live.service_order_id)) seriesByOs.set(live.service_order_id, []);
        seriesByOs.get(live.service_order_id)!.push(live);
      }
    }),
  ]);

  return rows.map((row) => {
    const liveSeries = seriesByOs.get(row.service_order_id) || [];
    const byNorm = new Map<string, LiveSeriesRow>();
    for (const s of liveSeries) {
      const key = normalizeSerial(s.serial_number);
      if (key && !byNorm.has(key)) byNorm.set(key, s);
    }

    // Preferir orden del tray (S1–S4); si no hay match por SN, caer a series_ids.
    const byId = new Map(liveSeries.map((s) => [s.id, s]));
    const resolved: (LiveSeriesRow | null)[] = (row.serial_numbers || []).map((sn, idx) => {
      const key = normalizeSerial(sn);
      if (key && byNorm.has(key)) return byNorm.get(key)!;
      const id = row.series_ids?.[idx];
      if (id && byId.has(id)) return byId.get(id)!;
      return null;
    });

    // Si el tray no trae serials pero sí hay series live, usarlas
    const effective =
      resolved.length > 0
        ? resolved
        : liveSeries.map((s) => s);

    const seriesSapStatuses = effective.map((s) => s?.sap_status ?? 'Pendiente');
    const liveStatus = resolveLiveUnitStatus(
      effective.filter((s): s is LiveSeriesRow => Boolean(s)),
      row.unit_status
    );

    return {
      ...row,
      sap_integration_status: orderStatusById.get(row.service_order_id) ?? null,
      series_sap_statuses: seriesSapStatuses,
      unit_status: liveStatus,
      unit_status_label: formatCacTrayStatusLabel(liveStatus),
      // Mantener IDs alineados al match live cuando sea posible
      series_ids: effective.map((s, i) => s?.id || row.series_ids?.[i] || ''),
    };
  });
}
