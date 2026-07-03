import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CAT_DIAGNOSTIC_REPAIR_SELECT,
  CAT_DIAGNOSTIC_SELECT,
} from '@/shared/constants/dbProjections';

export type WorkshopTabId =
  | 'diagnostico'
  | 'reparacion'
  | 'reacondicionado'
  | 'qc'
  | 'l3'
  | 'scraps'
  | 'listo';

const TAB_TO_STATUS: Record<Exclude<WorkshopTabId, 'listo'>, string> = {
  diagnostico: 'in_workshop',
  reparacion: 'in_qc',
  reacondicionado: 'ready_to_dispatch',
  qc: 'in_validation',
  l3: 'in_control_warehouse',
  scraps: 'irreparable',
};

const TALLER_WORKSHOP_AUDIT_ACTIONS = new Set([
  'INGRESO A TALLER',
  'DIAGNÓSTICO INICIAL COMPLETADO',
  'REPARACIÓN COMPLETADA',
  'CONTROL DE CALIDAD COMPLETADO',
  'REACONDICIONADO COMPLETADO',
  'TRASLADO MASIVO A TALLER',
]);

const WORKSHOP_AUDIT_ACTIONS_LIST = [...TALLER_WORKSHOP_AUDIT_ACTIONS];

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
const QUEUE_PAGE_SIZE = 50;
const MAX_QUEUE_OS = 5_000;

function isRpcMissing(error: { code?: string } | null): boolean {
  return error?.code === '42883' || error?.code === 'PGRST202';
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

function isWorkshopReadyInCentral(series: {
  current_status?: string | null;
  has_workshop_audit?: boolean;
}): boolean {
  return series.current_status === 'in_central_warehouse' && Boolean(series.has_workshop_audit);
}

function isWarehouseStockOnlyInCentral(series: {
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

async function collectQueueOsIds(
  supabase: SupabaseClient,
  status: string
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 100 && ids.length < MAX_QUEUE_OS; page++) {
    const { data, error } = await supabase.rpc('workshop_list_os_queue_page', {
      p_status: status,
      p_cursor: cursor,
      p_limit: QUEUE_PAGE_SIZE + 1,
    });

    if (error) throw error;
    if (!data?.length) break;

    const hasMore = data.length > QUEUE_PAGE_SIZE;
    const slice = hasMore ? data.slice(0, QUEUE_PAGE_SIZE) : data;
    for (const row of slice) {
      ids.push(String(row.service_order_id));
    }
    if (!hasMore) break;
    cursor = String(slice[slice.length - 1].service_order_id);
  }

  return ids;
}

async function fetchWorkshopSeriesForOsIds(
  supabase: SupabaseClient,
  osIds: string[],
  status: string
): Promise<any[]> {
  if (osIds.length === 0) return [];

  const rows: any[] = [];
  const chunkSize = 80;

  for (let i = 0; i < osIds.length; i += chunkSize) {
    const chunk = osIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('series')
      .select(WORKSHOP_SERIES_SELECT)
      .in('service_order_id', chunk)
      .eq('current_status', status)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[workshop/server] series for OS chunk:', error.message);
      continue;
    }
    if (data?.length) rows.push(...data);
  }

  return rows;
}

async function fetchWorkshopSeriesPaginated(
  supabase: SupabaseClient,
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
      console.error('[workshop/server] tasks page:', error.message);
      break;
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadWorkshopAuditIds(
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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

async function enrichWorkshopServiceOrders(supabase: SupabaseClient, rows: any[]) {
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
    const { data } = await supabase.from('service_orders').select('id, os_label').in('id', chunk);
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

async function fetchWorkshopTasksViaOsQueue(
  supabase: SupabaseClient,
  tab: Exclude<WorkshopTabId, 'listo'>,
  status: string
): Promise<any[] | null> {
  try {
    const osIds = await collectQueueOsIds(supabase, status);
    return fetchWorkshopSeriesForOsIds(supabase, osIds, status);
  } catch (error: any) {
    if (isRpcMissing(error)) return null;
    console.warn('[workshop/server] OS queue path failed:', error?.message || error);
    return null;
  }
}

/** Tareas agrupadas por OS para una pestaña de Taller (servidor / API v1). */
export async function queryWorkshopTasks(
  supabase: SupabaseClient,
  tab: WorkshopTabId
): Promise<any[]> {
  if (tab === 'listo') {
    let rows = await fetchWorkshopSeriesPaginated(supabase, ['in_central_warehouse']);
    rows = await attachWorkshopAuditFlags(supabase, rows, 'listo');
    rows = await enrichWorkshopServiceOrders(supabase, rows);
    return groupWorkshopSeriesRows(rows);
  }

  const status = TAB_TO_STATUS[tab];
  const queueRows = await fetchWorkshopTasksViaOsQueue(supabase, tab, status);

  let rows: any[];
  if (queueRows !== null) {
    rows = queueRows;
  } else {
    rows = await fetchWorkshopSeriesPaginated(supabase, [status]);
    if (status === 'in_central_warehouse') {
      rows = await attachWorkshopAuditFlags(supabase, rows, 'exclude_warehouse_stock');
    }
  }

  rows = await enrichWorkshopServiceOrders(supabase, rows);
  return groupWorkshopSeriesRows(rows);
}

/** Catálogos operativos de Taller con relaciones diagnóstico→reparación. */
export async function fetchWorkshopOperationCatalogs(supabase: SupabaseClient) {
  const [diagnosticsRes, repairsRes, reacondRes, relRes] = await Promise.all([
    supabase.from('cat_diagnostics').select(CAT_DIAGNOSTIC_SELECT).order('name'),
    supabase.from('cat_repairs').select('id, name').order('name'),
    supabase.from('cat_reacondicionado_tests').select('id, name, technology_ids, model_ids').order('name'),
    supabase.from('cat_diagnostic_repairs').select(CAT_DIAGNOSTIC_REPAIR_SELECT),
  ]);

  if (diagnosticsRes.error) throw diagnosticsRes.error;
  if (repairsRes.error) throw repairsRes.error;
  if (reacondRes.error) throw reacondRes.error;

  const relData = relRes.data ?? [];
  const diagnostics = (diagnosticsRes.data ?? []).map((d) => {
    const rels = relData.filter((r: { diagnostic_id: string }) => r.diagnostic_id === d.id);
    return {
      id: d.id,
      nombre: d.name,
      reparacionesIds: rels.map((r: { repair_id: string }) => r.repair_id),
    };
  });

  return {
    diagnostics,
    repairs: (repairsRes.data ?? []).map((r) => ({ id: r.id, nombre: r.name })),
    reacondicionadoTests: reacondRes.data ?? [],
  };
}

export { WORKSHOP_AUDIT_ACTIONS_LIST };
