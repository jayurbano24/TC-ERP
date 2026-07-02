import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/database/audit";

const TALLER_WORKSHOP_AUDIT_ACTIONS = new Set([
  'INGRESO A TALLER',
  'DIAGNÓSTICO INICIAL COMPLETADO',
  'REPARACIÓN COMPLETADA',
  'CONTROL DE CALIDAD COMPLETADO',
  'REACONDICIONADO COMPLETADO',
  'TRASLADO MASIVO A TALLER',
]);

const WORKSHOP_AUDIT_ACTIONS_LIST = [...TALLER_WORKSHOP_AUDIT_ACTIONS];

export type WorkshopTabId =
  | 'diagnostico'
  | 'reparacion'
  | 'reacondicionado'
  | 'qc'
  | 'l3'
  | 'scraps'
  | 'listo';

const TAB_TO_STATUS: Record<WorkshopTabId, string> = {
  diagnostico: 'in_workshop',
  reparacion: 'in_qc',
  reacondicionado: 'ready_to_dispatch',
  qc: 'in_validation',
  l3: 'in_control_warehouse',
  scraps: 'irreparable',
  listo: 'in_central_warehouse',
};

const WORKSHOP_STATUSES = Object.values(TAB_TO_STATUS);

const WORKSHOP_SERIES_SELECT = `
  id,
  serial_number,
  service_order_id,
  current_status,
  updated_at,
  brand_id,
  model_id,
  models (
    id,
    name,
    technology_id,
    technologies ( id, name )
  ),
  brands ( id, name ),
  service_orders (
    id,
    os_label,
    reception_guide_id,
    sap_transfer_id,
    reception_guides ( guide_number, agency ),
    sap_transfer_documents ( agency )
  ),
  receptions:current_reception_id (
    guide_number,
    notes,
    carrier,
    source,
    reception_guides ( guide_number, agency )
  ),
  boxes ( box_code, rack_location ),
  ingress_count,
  current_diagnostics
`;

const PAGE_SIZE = 1000;
const MAX_ROWS = 20_000;

/** Equipo listo = volvió a bodega central tras pasar por taller (tiene auditoría de taller). */
export function isWorkshopReadyInCentral(series: {
  current_status?: string | null;
  has_workshop_audit?: boolean;
}): boolean {
  return series.current_status === 'in_central_warehouse' && Boolean(series.has_workshop_audit);
}

/** Stock en racks de bodega física no debe aparecer en cola Taller (Equipo Listo). */
export function isWarehouseStockOnlyInCentral(series: {
  current_status?: string | null;
  ingress_count?: number | null;
  boxes?: { rack_location?: string | null } | null;
  has_workshop_audit?: boolean;
}): boolean {
  if (series.current_status !== 'in_central_warehouse') return false;
  if (series.has_workshop_audit) return false;

  const rack = String(series.boxes?.rack_location || '').toUpperCase();
  if (!rack || rack.startsWith('TALLER')) return false;
  if (rack === 'DESPACHO' || rack === 'ELIMINADO') return false;

  const isPhysicalBodegaRack =
    rack.startsWith('BODEGA') || rack.startsWith('P-') || rack.startsWith('RACK-');
  return isPhysicalBodegaRack;
}

async function fetchWorkshopSeriesPaginated(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  statuses: string[]
) {
  const rows: any[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('series')
      .select(WORKSHOP_SERIES_SELECT)
      .in('current_status', statuses)
      .order('updated_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Error fetching workshop tasks page:', error.message || error);
      break;
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadWorkshopAuditIds(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  seriesIds: string[]
): Promise<Set<string>> {
  const workshopAuditIds = new Set<string>();
  if (seriesIds.length === 0) return workshopAuditIds;

  const chunkSize = 200;
  for (let i = 0; i < seriesIds.length; i += chunkSize) {
    const chunk = seriesIds.slice(i, i + chunkSize);
    const { data: auditRows } = await supabase
      .from('erp_audit_logs')
      .select('record_id, action')
      .in('record_id', chunk);
    for (const log of auditRows || []) {
      if (TALLER_WORKSHOP_AUDIT_ACTIONS.has(String(log.action))) {
        workshopAuditIds.add(String(log.record_id));
      }
    }
  }
  return workshopAuditIds;
}

async function attachWorkshopAuditFlags(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  rows: any[],
  mode: 'listo' | 'exclude_warehouse_stock' = 'exclude_warehouse_stock'
) {
  const centralWarehouseIds = rows
    .filter((row) => row.current_status === 'in_central_warehouse')
    .map((row) => row.id as string);

  const workshopAuditIds = await loadWorkshopAuditIds(supabase, centralWarehouseIds);

  return rows.filter((row) => {
    if (row.current_status !== 'in_central_warehouse') return true;

    const hasWorkshopAudit = workshopAuditIds.has(row.id as string);

    if (mode === 'listo') {
      return isWorkshopReadyInCentral({
        current_status: row.current_status,
        has_workshop_audit: hasWorkshopAudit,
      });
    }

    return !isWarehouseStockOnlyInCentral({
      current_status: row.current_status,
      ingress_count: row.ingress_count,
      boxes: row.boxes as { rack_location?: string | null } | null,
      has_workshop_audit: hasWorkshopAudit,
    });
  });
}

async function countWorkshopTasksByServiceOrder(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  status: string
): Promise<number> {
  const groupKeys = new Set<string>();

  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('series')
      .select('id, service_order_id')
      .eq('current_status', status)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Error counting workshop tasks by OS:', error.message || error);
      break;
    }
    if (!data?.length) break;

    for (const row of data) {
      groupKeys.add(workshopGroupKey(row));
    }
    if (data.length < PAGE_SIZE) break;
  }

  return groupKeys.size;
}

async function countWorkshopListoByServiceOrder(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>
): Promise<number> {
  const workshopSeriesIds = new Set<string>();
  let auditOffset = 0;

  while (auditOffset < 500_000) {
    const { data, error } = await supabase
      .from('erp_audit_logs')
      .select('record_id')
      .in('action', WORKSHOP_AUDIT_ACTIONS_LIST)
      .range(auditOffset, auditOffset + PAGE_SIZE - 1);

    if (error) {
      console.error('Error counting workshop listo audits:', error.message || error);
      break;
    }
    if (!data?.length) break;

    for (const row of data) {
      workshopSeriesIds.add(String(row.record_id));
    }
    if (data.length < PAGE_SIZE) break;
    auditOffset += PAGE_SIZE;
  }

  const groupKeys = new Set<string>();
  const ids = [...workshopSeriesIds];

  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const { data, error } = await supabase
      .from('series')
      .select('id, service_order_id')
      .eq('current_status', 'in_central_warehouse')
      .in('id', chunk);

    if (error) {
      console.error('Error counting workshop listo by OS:', error.message || error);
      continue;
    }

    for (const row of data || []) {
      groupKeys.add(workshopGroupKey(row));
    }
  }

  return groupKeys.size;
}

/** Completa os_label cuando el embed service_orders viene null (RLS/join). */
async function enrichWorkshopServiceOrders(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  rows: any[]
) {
  const missingIds = [
    ...new Set(
      rows
        .filter((row) => row.service_order_id && !row.service_orders?.os_label)
        .map((row) => row.service_order_id as string)
    ),
  ];
  if (missingIds.length === 0) return rows;

  const labelById = new Map<string, { id: string; os_label: string }>();
  for (let i = 0; i < missingIds.length; i += 80) {
    const chunk = missingIds.slice(i, i + 80);
    const { data } = await supabase
      .from('service_orders')
      .select('id, os_label')
      .in('id', chunk);
    for (const row of data || []) {
      labelById.set(row.id as string, row as { id: string; os_label: string });
    }
  }

  return rows.map((row) => {
    if (row.service_orders?.os_label || !row.service_order_id) return row;
    const order = labelById.get(row.service_order_id as string);
    return order ? { ...row, service_orders: order } : row;
  });
}

function workshopGroupKey(row: {
  id?: string;
  service_order_id?: string | null;
  service_orders?: { os_label?: string | null } | null;
}): string {
  if (row.service_order_id) return `so:${row.service_order_id}`;
  if (row.service_orders?.os_label) return `os:${row.service_orders.os_label}`;
  return `series:${row.id}`;
}

function groupWorkshopSeriesRows(rows: any[]) {
  const groupedMap = new Map<string, any>();

  for (const row of rows) {
    const groupKey = workshopGroupKey(row);

    if (!groupedMap.has(groupKey)) {
      groupedMap.set(groupKey, {
        ...row,
        all_dbIds: [row.id],
        all_sns: row.serial_number ? [row.serial_number] : [],
      });
      continue;
    }

    const existing = groupedMap.get(groupKey)!;
    if (!existing.all_dbIds.includes(row.id)) existing.all_dbIds.push(row.id);
    if (row.serial_number && !existing.all_sns.includes(row.serial_number)) {
      existing.all_sns.push(row.serial_number);
    }
    if (!existing.service_orders?.os_label && row.service_orders?.os_label) {
      existing.service_orders = row.service_orders;
    }
    if (new Date(String(row.updated_at)) > new Date(String(existing.updated_at))) {
      existing.updated_at = row.updated_at;
    }
  }

  return [...groupedMap.values()];
}

export { groupWorkshopSeriesRows };

/** Conteos por pestaña agrupados por Orden de Servicio (no por serie suelta). */
export async function getWorkshopTaskCounts(): Promise<Record<string, number>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return {};

  const entries = Object.entries(TAB_TO_STATUS) as [WorkshopTabId, string][];
  const results = await Promise.all(
    entries.map(async ([tab, status]) => {
      if (tab === 'listo') {
        const count = await countWorkshopListoByServiceOrder(supabase);
        return { tab, count };
      }

      const count = await countWorkshopTasksByServiceOrder(supabase, status);
      return { tab, count };
    })
  );

  const counts: Record<string, number> = {};
  for (const { tab, count } of results) {
    counts[tab] = count;
  }
  return counts;
}

export async function getWorkshopTasks(tab?: WorkshopTabId) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const statuses =
    tab && TAB_TO_STATUS[tab] ? [TAB_TO_STATUS[tab]] : WORKSHOP_STATUSES;

  let rows = await fetchWorkshopSeriesPaginated(supabase, statuses);

  if (statuses.includes('in_central_warehouse')) {
    rows = await attachWorkshopAuditFlags(
      supabase,
      rows,
      tab === 'listo' ? 'listo' : 'exclude_warehouse_stock'
    );
  }

  rows = await enrichWorkshopServiceOrders(supabase, rows);
  return groupWorkshopSeriesRows(rows);
}

export async function saveDiagnostic(seriesId: string, result: string, notes: string, selectedDiagnostics: string[] = [], actionName: string = 'DIAGNÓSTICO INICIAL COMPLETADO') {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  // 2. Update series status based on diagnostic
  let nextStatus = 'in_workshop';
  if (result === 'reacondicionado') nextStatus = 'ready_to_dispatch';
  if (result === 'reparacion') nextStatus = 'in_qc';
  if (result === 'control_calidad') nextStatus = 'in_validation';
  if (result === 'l3') nextStatus = 'in_control_warehouse';
  if (result === 'scraps') nextStatus = 'irreparable';
  if (result === 'listo') nextStatus = 'in_central_warehouse';
  if (result === 'rechazado_qc') nextStatus = 'in_qc';

  let updateData: any = { current_status: nextStatus };
  if (actionName === 'DIAGNÓSTICO INICIAL COMPLETADO') {
    updateData.current_diagnostics = selectedDiagnostics;
  }

  const { error: seriesError } = await supabase
    .from('series')
    .update(updateData)
    .eq('id', seriesId);

  if (seriesError) return { error: seriesError.message };

  await logAudit('series', seriesId, actionName, {
    result,
    notes,
    nextStatus,
    diagnostics: actionName === 'DIAGNÓSTICO INICIAL COMPLETADO' ? selectedDiagnostics : undefined,
    repairs: actionName === 'REPARACIÓN COMPLETADA' ? selectedDiagnostics : undefined,
    items: selectedDiagnostics // Fallback for UI visualization
  });

  return { success: true };
}

export async function updateSeriesStatus(seriesId: string, status: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { error } = await supabase
    .from('series')
    .update({ current_status: status })
    .eq('id', seriesId);

  if (error) return { error: error.message };

  await logAudit('series', seriesId, 'INGRESO A TALLER', {
    status
  });
  return { success: true };
}

export async function transferMassiveToWorkshop(seriesIds: string[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { error } = await supabase
    .from('series')
    .update({ current_status: 'in_workshop' })
    .in('id', seriesIds);

  if (error) return { error: error.message };

  // Log audit for each
  for (const seriesId of seriesIds) {
    await logAudit('series', seriesId, 'TRASLADO MASIVO A TALLER', {
      status: 'in_workshop',
      reason: 'Movimiento Masivo desde Backoffice'
    });
  }

  return { success: true };
}
