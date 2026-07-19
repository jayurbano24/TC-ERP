import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CAT_DIAGNOSTIC_REPAIR_SELECT,
  CAT_DIAGNOSTIC_SELECT,
} from '@/shared/constants/dbProjections';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import {
  parseWorkshopSearchTokens,
  sanitizeWorkshopSearchToken,
} from '@/modules/workshop/shared/workshopSearch';
import { resolveEntrySource } from '@/modules/workshop/shared/entrySource';

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

const STATUS_TO_TAB: Record<string, WorkshopTabId> = {
  in_workshop: 'diagnostico',
  in_qc: 'reparacion',
  ready_to_dispatch: 'reacondicionado',
  in_validation: 'qc',
  in_control_warehouse: 'l3',
  irreparable: 'scraps',
  scrap: 'scraps',
  in_central_warehouse: 'listo',
};

export const WORKSHOP_TAB_LABELS: Record<WorkshopTabId, string> = {
  diagnostico: 'Diagnóstico',
  reparacion: 'Reparación',
  reacondicionado: 'Reacondicionado',
  qc: 'Control de Calidad',
  l3: 'L3 (Avanzado)',
  scraps: 'SCRAPS',
  listo: 'Equipo Listo',
};

const WORKSHOP_QUEUE_STATUSES = Object.values(TAB_TO_STATUS);

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
  entry_source,
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
    reception_guides ( guide_number, agency )
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

export type WorkshopLocateResult = {
  found: boolean;
  tab: WorkshopTabId | null;
  tabLabel: string | null;
  status: string | null;
  osLabel: string | null;
  serial: string | null;
  serviceOrderId: string | null;
};

function sanitizeWorkshopSearch(raw: string): string {
  return sanitizeWorkshopSearchToken(raw);
}

function postgrestInList(tokens: string[]): string {
  return tokens.map((t) => `"${t.replace(/"/g, '')}"`).join(',');
}

/** Busca serie/OS dentro de una pestaña — 1 token (OS/serie) o hasta 25 series pegadas. */
async function searchWorkshopSeriesInTab(
  supabase: SupabaseClient,
  tab: WorkshopTabId,
  rawQuery: string
): Promise<any[]> {
  const { tokens } = parseWorkshopSearchTokens(rawQuery);
  if (tokens.length === 0) return [];

  if (tokens.length === 1) {
    return searchWorkshopSeriesSingleInTab(supabase, tab, tokens[0]);
  }

  return searchWorkshopSeriesMultiInTab(supabase, tab, tokens);
}

async function searchWorkshopSeriesSingleInTab(
  supabase: SupabaseClient,
  tab: WorkshopTabId,
  query: string
): Promise<any[]> {
  const located = await locateWorkshopEquipment(supabase, query);
  if (!located.found || !located.status || !located.serviceOrderId) return [];

  const expectedStatus =
    tab === 'listo' ? 'in_central_warehouse' : TAB_TO_STATUS[tab as Exclude<WorkshopTabId, 'listo'>];
  if (located.status !== expectedStatus) return [];

  let rows = await fetchWorkshopSeriesForOsIds(
    supabase,
    [located.serviceOrderId],
    located.status
  );
  if (tab === 'listo') {
    rows = await attachWorkshopAuditFlags(supabase, rows, 'listo');
  }
  rows = await enrichWorkshopServiceOrders(supabase, rows);
  if (tab === 'diagnostico') {
    rows = await enrichWorkshopSourceBoxCodes(supabase, rows);
  }
  return groupWorkshopSeriesRows(rows);
}

async function searchWorkshopSeriesMultiInTab(
  supabase: SupabaseClient,
  tab: WorkshopTabId,
  tokens: string[]
): Promise<any[]> {
  const status =
    tab === 'listo' ? 'in_central_warehouse' : TAB_TO_STATUS[tab as Exclude<WorkshopTabId, 'listo'>];
  const inList = postgrestInList(tokens);

  const { data, error } = await supabase
    .from('series')
    .select('id, service_order_id, serial_number, current_status')
    .eq('current_status', status)
    .or(
      `serial_number.in.(${inList}),s2.in.(${inList}),s3.in.(${inList}),s4.in.(${inList})`
    )
    .limit(BATCH_LIMITS.WORKSHOP_SEARCH_MAX_SERIALS * 4);

  if (error) {
    console.error('[workshop/server] multi-serial search:', error.message);
    throw error;
  }

  const osIds = [
    ...new Set(
      (data || [])
        .map((r) => r.service_order_id as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  // Unidad completa: cargar TODAS las series de cada OS en esta etapa
  let rows = await fetchWorkshopSeriesForOsIds(supabase, osIds, status);

  // Series huérfanas (sin OS) que matchearon el token
  const orphanIds = (data || [])
    .filter((r) => !r.service_order_id)
    .map((r) => String(r.id));
  if (orphanIds.length > 0) {
    const { data: orphans } = await supabase
      .from('series')
      .select(WORKSHOP_SERIES_SELECT)
      .in('id', orphanIds)
      .eq('current_status', status);
    if (orphans?.length) rows = [...rows, ...orphans];
  }

  if (tab === 'listo') {
    rows = await attachWorkshopAuditFlags(supabase, rows, 'listo');
  }
  rows = await enrichWorkshopServiceOrders(supabase, rows);
  if (tab === 'diagnostico') {
    rows = await enrichWorkshopSourceBoxCodes(supabase, rows);
  }
  return groupWorkshopSeriesRows(rows);
}

/** Ubica un equipo en cualquier etapa de Taller por serie u OS. */
export async function locateWorkshopEquipment(
  supabase: SupabaseClient,
  rawQuery: string
): Promise<WorkshopLocateResult> {
  const query = sanitizeWorkshopSearch(rawQuery);
  if (!query) {
    return {
      found: false,
      tab: null,
      tabLabel: null,
      status: null,
      osLabel: null,
      serial: null,
      serviceOrderId: null,
    };
  }

  const { data: bySerial } = await supabase
    .from('series')
    .select('id, serial_number, current_status, service_order_id, service_orders(os_label)')
    .or(
      `serial_number.ilike.%${query}%,s2.ilike.%${query}%,s3.ilike.%${query}%,s4.ilike.%${query}%`
    )
    .order('updated_at', { ascending: false })
    .limit(5);

  let hit = bySerial?.[0] ?? null;

  if (!hit) {
    const { data: osRows } = await supabase
      .from('service_orders')
      .select('id, os_label')
      .ilike('os_label', `%${query}%`)
      .limit(5);
    const osId = osRows?.[0]?.id;
    if (osId) {
      const { data: byOs } = await supabase
        .from('series')
        .select('id, serial_number, current_status, service_order_id, service_orders(os_label)')
        .eq('service_order_id', osId)
        .order('updated_at', { ascending: false })
        .limit(1);
      hit = byOs?.[0] ?? null;
    }
  }

  if (!hit) {
    return {
      found: false,
      tab: null,
      tabLabel: null,
      status: null,
      osLabel: null,
      serial: null,
      serviceOrderId: null,
    };
  }

  const status = String(hit.current_status || '');
  const tab = STATUS_TO_TAB[status] ?? null;
  const osLabel = (hit.service_orders as { os_label?: string } | null)?.os_label || null;

  return {
    found: true,
    tab,
    tabLabel: tab ? WORKSHOP_TAB_LABELS[tab] : null,
    status,
    osLabel,
    serial: hit.serial_number as string,
    serviceOrderId: (hit.service_order_id as string) || null,
  };
}

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

function serialFingerprint(sns: string[]): string {
  return [...sns].map((s) => s.toUpperCase()).sort().join('|');
}

function resolveSeriesEntrySource(row: {
  entry_source?: string | null;
  receptions?: { source?: string | null; guide_number?: string | null } | null;
  series_entry_map?: Record<string, string> | null;
  serial_number?: string | null;
}): 'cac' | 'px' | null {
  return resolveEntrySource({
    entry_source: row.entry_source,
    receptions: row.receptions,
    series_entry_map: row.series_entry_map,
    serial: row.serial_number,
    guide: row.receptions?.guide_number,
  });
}

function mergeWorkshopGroup(target: any, source: any) {
  for (const id of source.all_dbIds || [source.id]) {
    if (id && !target.all_dbIds.includes(id)) target.all_dbIds.push(id);
  }
  for (const sn of source.all_sns || (source.serial_number ? [source.serial_number] : [])) {
    if (sn && !target.all_sns.includes(sn)) target.all_sns.push(sn);
  }
  if (!target.series_entry_map) target.series_entry_map = {};
  const srcMap = source.series_entry_map || {};
  for (const [sn, src] of Object.entries(srcMap)) {
    if (sn && src && !target.series_entry_map[sn]) target.series_entry_map[sn] = src;
  }
  if (!target.entry_source && source.entry_source) {
    target.entry_source = source.entry_source;
  }
  if (!target.source_box_code && source.source_box_code) {
    target.source_box_code = source.source_box_code;
  }
  if (!target.service_orders?.os_label && source.service_orders?.os_label) {
    target.service_orders = source.service_orders;
  }
  if (!target.service_order_id && source.service_order_id) {
    target.service_order_id = source.service_order_id;
  }
  if (new Date(String(source.updated_at)) > new Date(String(target.updated_at))) {
    target.updated_at = source.updated_at;
  }
}

/** Colapsa grupos duplicados (misma OS o mismo set de series S1–S4). */
function dedupeWorkshopGroups(groups: any[]): any[] {
  const out: any[] = [];
  const byOs = new Map<string, number>();
  const byLabel = new Map<string, number>();
  const byFp = new Map<string, number>();

  for (const g of groups) {
    g.all_dbIds = g.all_dbIds || [g.id];
    g.all_sns = g.all_sns || (g.serial_number ? [g.serial_number] : []);
    const osKey = g.service_order_id ? String(g.service_order_id) : '';
    const labelKey = g.service_orders?.os_label
      ? String(g.service_orders.os_label).toUpperCase()
      : '';
    const fp = serialFingerprint(g.all_sns);

    const existingIdx = (() => {
      if (osKey && byOs.has(osKey)) return byOs.get(osKey);
      if (labelKey && byLabel.has(labelKey)) return byLabel.get(labelKey);
      if (fp && byFp.has(fp)) return byFp.get(fp);
      return undefined;
    })();

    if (existingIdx != null) {
      mergeWorkshopGroup(out[existingIdx], g);
      continue;
    }

    const idx = out.length;
    out.push(g);
    if (osKey) byOs.set(osKey, idx);
    if (labelKey) byLabel.set(labelKey, idx);
    if (fp) byFp.set(fp, idx);
  }

  for (const g of out) {
    g.all_sns = [...(g.all_sns || [])].sort(
      (a: string, b: string) => b.length - a.length || a.localeCompare(b)
    );
  }

  return out;
}

function groupWorkshopSeriesRows(rows: any[]) {
  const groupedMap = new Map<string, any>();

  for (const row of rows) {
    const groupKey = workshopGroupKey(row);

    const entrySource = resolveSeriesEntrySource(row);
    const sn = row.serial_number ? String(row.serial_number) : '';
    const seriesEntryMap = sn && entrySource ? { [sn]: entrySource } : {};

    if (!groupedMap.has(groupKey)) {
      groupedMap.set(groupKey, {
        ...row,
        // No pisar entry_source de la fila con null
        entry_source: entrySource ?? row.entry_source ?? null,
        series_entry_map: seriesEntryMap,
        all_dbIds: [row.id],
        all_sns: sn ? [sn] : [],
        source_box_code: row.source_box_code ?? null,
      });
      continue;
    }

    const existing = groupedMap.get(groupKey)!;
    mergeWorkshopGroup(existing, {
      ...row,
      entry_source: entrySource ?? row.entry_source ?? null,
      series_entry_map: seriesEntryMap,
      all_dbIds: [row.id],
      all_sns: sn ? [sn] : [],
    });
  }

  const groups = dedupeWorkshopGroups([...groupedMap.values()]);
  for (const g of groups) {
    if (!g.entry_source) {
      g.entry_source = resolveEntrySource({
        entry_source: g.entry_source,
        receptions: g.receptions,
        series_entry_map: g.series_entry_map,
        guide: g.receptions?.guide_number,
      });
    }
  }
  return groups;
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
      .select('record_id')
      .in('record_id', chunk)
      .in('action', WORKSHOP_AUDIT_ACTIONS_LIST);
    for (const log of auditRows || []) {
      workshopAuditIds.add(String(log.record_id));
    }
  }
  return workshopAuditIds;
}

/**
 * Fallback sin RPC 113: escanea bodega reciente (thin) + auditoría filtrada.
 * No carga el SELECT completo de taller hasta tener OS candidatas.
 */
async function fetchListoOsIdsFallback(
  supabase: SupabaseClient,
  limit: number
): Promise<string[]> {
  const osIds: string[] = [];
  const seen = new Set<string>();
  const CHUNK = 300;
  const MAX_SCAN = 6_000;
  let offset = 0;

  while (seen.size < limit && offset < MAX_SCAN) {
    const { data: seriesChunk, error } = await supabase
      .from('series')
      .select('id, service_order_id')
      .eq('current_status', 'in_central_warehouse')
      .not('service_order_id', 'is', null)
      .order('updated_at', { ascending: false })
      .range(offset, offset + CHUNK - 1);

    if (error) {
      console.error('[workshop/server] listo fallback scan:', error.message);
      break;
    }
    if (!seriesChunk?.length) break;

    const ids = seriesChunk.map((r) => String(r.id));
    const audited = await loadWorkshopAuditIds(supabase, ids);

    for (const row of seriesChunk) {
      if (!audited.has(String(row.id))) continue;
      const osId = String(row.service_order_id);
      if (seen.has(osId)) continue;
      seen.add(osId);
      osIds.push(osId);
      if (seen.size >= limit) break;
    }

    offset += CHUNK;
    if (seriesChunk.length < CHUNK) break;
  }

  return osIds;
}

async function queryListoTasksPage(
  supabase: SupabaseClient,
  opts: { cursor?: string | null; limit: number }
): Promise<WorkshopTasksPageResult> {
  const limit = opts.limit;
  let osIds: string[] = [];
  let nextCursor: string | null = null;
  let usedRpc = false;

  // cursor = ISO timestamptz del sort_ts de la última fila
  const cursorTs = opts.cursor?.trim() || null;

  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    'workshop_list_listo_os_page',
    {
      p_cursor: cursorTs,
      p_limit: limit + 1,
    }
  );

  if (!rpcError && Array.isArray(rpcRows)) {
    usedRpc = true;
    const hasMore = rpcRows.length > limit;
    const page = hasMore ? rpcRows.slice(0, limit) : rpcRows;
    osIds = page.map((r: { service_order_id: string }) => String(r.service_order_id));
    nextCursor = hasMore
      ? String(page[page.length - 1].sort_ts)
      : null;
  } else if (rpcError && !isRpcMissing(rpcError)) {
    console.warn('[workshop/server] listo RPC failed, fallback:', rpcError.message);
  }

  if (!usedRpc) {
    osIds = await fetchListoOsIdsFallback(supabase, limit);
    nextCursor = null;
  }

  let seriesRows = await fetchWorkshopSeriesForOsIds(
    supabase,
    osIds,
    'in_central_warehouse'
  );
  // Ya filtrados por auditoría en RPC/fallback; no re-escanear todo el stock.
  seriesRows = await enrichWorkshopServiceOrders(supabase, seriesRows);
  const items = groupWorkshopSeriesRows(seriesRows);

  const { data: totalOs } = await supabase.rpc('count_workshop_os_all_tabs');
  const listoTotal =
    totalOs && typeof totalOs === 'object' && 'listo' in (totalOs as object)
      ? Number((totalOs as { listo: number }).listo)
      : items.length;

  return {
    items,
    nextCursor,
    totalOs: Number.isFinite(listoTotal) ? listoTotal : items.length,
  };
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

/** Caja de origen tras dispersión bodega → taller (current_box_id queda NULL). */
async function enrichWorkshopSourceBoxCodes(
  supabase: SupabaseClient,
  rows: any[]
): Promise<any[]> {
  const seriesIds = rows.map((r) => r.id as string).filter(Boolean);
  if (seriesIds.length === 0) return rows;

  const boxBySeries = new Map<string, string>();

  for (let i = 0; i < seriesIds.length; i += 80) {
    const chunk = seriesIds.slice(i, i + 80);
    const { data } = await supabase
      .from('warehouse_movements')
      .select('box_code, series_ids, created_at')
      .eq('movement_type', 'DISPERSION_CAJA')
      .overlaps('series_ids', chunk)
      .order('created_at', { ascending: false })
      .limit(300);

    for (const mov of data || []) {
      const code = String(mov.box_code || '').trim();
      if (!code) continue;
      for (const sid of (mov.series_ids as string[]) || []) {
        if (!boxBySeries.has(sid)) boxBySeries.set(sid, code);
      }
    }
  }

  return rows.map((row) => ({
    ...row,
    source_box_code:
      boxBySeries.get(row.id as string) ||
      (row.boxes as { box_code?: string } | null)?.box_code ||
      null,
  }));
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
  const page = await queryWorkshopTasksPage(supabase, tab, {});
  return page.items;
}

export type WorkshopTasksPageResult = {
  items: any[];
  nextCursor: string | null;
  totalOs: number | null;
};

/** Cola paginada por OS — evita cargar 400+ OS de una sola vez. */
export async function queryWorkshopTasksPage(
  supabase: SupabaseClient,
  tab: WorkshopTabId,
  opts: { cursor?: string | null; limit?: number; search?: string }
): Promise<WorkshopTasksPageResult> {
  const search = opts.search?.trim();
  if (search) {
    const items = await searchWorkshopSeriesInTab(supabase, tab, search);
    return { items, nextCursor: null, totalOs: items.length };
  }

  const limit = Math.min(
    Math.max(opts.limit ?? BATCH_LIMITS.WORKSHOP_QUEUE_PAGE_OS, 1),
    BATCH_LIMITS.API_PAGE_MAX
  );

  if (tab === 'listo') {
    return queryListoTasksPage(supabase, {
      cursor: opts.cursor ?? null,
      limit,
    });
  }

  const status = TAB_TO_STATUS[tab];

  const [{ data: queueRows, error: queueError }, { data: totalOs, error: countError }] =
    await Promise.all([
      supabase.rpc('workshop_list_os_queue_page', {
        p_status: status,
        p_cursor: opts.cursor ?? null,
        p_limit: limit + 1,
      }),
      supabase.rpc('count_workshop_os_by_status', { p_status: status }),
    ]);

  if (queueError) {
    if (isRpcMissing(queueError)) {
      const items = await queryWorkshopTasksLegacyAll(supabase, tab);
      return { items, nextCursor: null, totalOs: items.length };
    }
    throw queueError;
  }

  if (countError && !isRpcMissing(countError)) {
    console.warn('[workshop/server] count RPC failed:', countError.message);
  }

  const rows = queueRows ?? [];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const osIds = pageRows.map((r: { service_order_id: string }) => String(r.service_order_id));

  let seriesRows = await fetchWorkshopSeriesForOsIds(supabase, osIds, status);
  seriesRows = await enrichWorkshopServiceOrders(supabase, seriesRows);
  if (tab === 'diagnostico') {
    seriesRows = await enrichWorkshopSourceBoxCodes(supabase, seriesRows);
  }
  const items = groupWorkshopSeriesRows(seriesRows);

  return {
    items,
    nextCursor: hasMore ? String(pageRows[pageRows.length - 1].service_order_id) : null,
    totalOs: typeof totalOs === 'number' ? totalOs : null,
  };
}

async function queryWorkshopTasksLegacyAll(
  supabase: SupabaseClient,
  tab: WorkshopTabId
): Promise<any[]> {
  const status = TAB_TO_STATUS[tab as Exclude<WorkshopTabId, 'listo'>];
  let rows = await fetchWorkshopSeriesPaginated(supabase, [status]);
  if (status === 'in_central_warehouse') {
    rows = await attachWorkshopAuditFlags(supabase, rows, 'exclude_warehouse_stock');
  }
  rows = await enrichWorkshopServiceOrders(supabase, rows);
  if (tab === 'diagnostico') {
    rows = await enrichWorkshopSourceBoxCodes(supabase, rows);
  }
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
