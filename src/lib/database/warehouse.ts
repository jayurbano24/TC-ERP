import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { v5 as uuidv5 } from "uuid";
import { BATCH_LIMITS } from "@/shared/constants/batchLimits";
import { isWarehouseTransferApiEnabled } from "@/shared/feature-flags/clientFlags";
import { transferBoxesToWorkshopViaApi } from "@/lib/api/warehouseTransfer";

/** Namespace fijo para claves idempotentes determinísticas (caja + acción + destino). */
const WAREHOUSE_IDEMPOTENCY_NS = "a3f2c8e1-9b4d-4e7a-8c1f-2d6e9a0b5c3d";

export function warehouseBoxIdempotencyKey(
  boxId: string,
  action: "dispersion" | "traslado" | "salida",
  target: string
): string {
  return uuidv5(`${action}:${boxId}:${target}`, WAREHOUSE_IDEMPOTENCY_NS);
}

/** Proyección mínima de cajas (evita select('*')). */
const BOX_MINIMAL_SELECT =
  'id, box_code, rack_location, status, capacity, brand_id, model_id, reception_id, created_at, updated_at';
async function syncSapTransferIngresadoForSeries(
  supabase: SupabaseClient,
  seriesIds: string[]
): Promise<number> {
  if (!seriesIds.length) return 0;
  const { data, error } = await supabase.rpc('warehouse_sync_sap_for_series', {
    p_series_ids: seriesIds,
  });
  if (error) {
    console.warn('warehouse_sync_sap_for_series:', error.message);
    return 0;
  }
  return typeof data === 'number' ? data : 0;
}

/** Estados que cuentan como inventario físico en bodega central / L3. */
export const WAREHOUSE_INVENTORY_STATUSES = [
  'in_central_warehouse',
  'in_control_warehouse',
] as const;

const AREA_TO_SERIES_STATUS: Record<string, string> = {
  'Bodega Central': 'in_central_warehouse',
  'Bodega SCRAP': 'irreparable',
  SCRAP: 'irreparable',
  'Bodega Obsoleto': 'obsolete',
  Obsoleto: 'obsolete',
  Diagnóstico: 'in_workshop',
  Reparación: 'in_qc',
  L3: 'in_control_warehouse',
};

const AREA_TO_RACK: Record<string, string> = {
  'Bodega SCRAP': 'SCRAP',
  SCRAP: 'SCRAP',
  'Bodega Obsoleto': 'OBSOLETO',
  Obsoleto: 'OBSOLETO',
  Diagnóstico: 'TALLER-DIAGNOSTICO',
  Reparación: 'TALLER-REPARACION',
  L3: 'BODEGA-L3',
};

/** Áreas seleccionables como destino en transferencia masiva de cajas. */
export const WAREHOUSE_DESTINATION_AREAS = [
  'Bodega Central',
  'Bodega SCRAP',
  'Bodega Obsoleto',
  'Diagnóstico',
] as const;

/** Origen de una caja según rack o etiqueta de área del inventario. */
export function resolveInventoryBoxOriginArea(box: {
  area?: string | null;
  rack?: string | null;
  rack_location?: string | null;
}): string | null {
  if (box.area?.trim()) return box.area.trim();
  const rack = String(box.rack_location || box.rack || '').toUpperCase();
  if (!rack || rack === 'SIN RACK') return null;
  if (
    rack === 'BODEGA_CENTRAL' ||
    rack.startsWith('P-') ||
    rack.startsWith('RACK-') ||
    rack.startsWith('BODEGA')
  ) {
    return 'Bodega Central';
  }
  if (rack === 'SCRAP') return 'Bodega SCRAP';
  if (rack === 'OBSOLETO') return 'Bodega Obsoleto';
  if (rack.startsWith('TALLER')) return 'Diagnóstico';
  return null;
}

/** Destinos permitidos excluyendo la(s) bodega(s) de origen de las cajas seleccionadas. */
export function availableWarehouseDestinations(
  excludedOrigins: Iterable<string>
): string[] {
  const excluded = new Set(excludedOrigins);
  return WAREHOUSE_DESTINATION_AREAS.filter((area) => !excluded.has(area));
}

export function resolveWarehouseStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'in_central_warehouse':
      return 'BODEGA CENTRAL';
    case 'in_control_warehouse':
      return 'BODEGA L3';
    case 'RECEPCIONADO_BODEGA_GENERAL':
      return 'PENDIENTE INGRESO';
    case 'in_workshop':
      return 'TALLER · DIAGNÓSTICO';
    case 'in_qc':
      return 'TALLER · REPARACIÓN';
    case 'in_validation':
      return 'TALLER · QC';
    case 'ready_to_dispatch':
      return 'LISTO DESPACHO';
    case 'dispatched':
      return 'DESPACHADO';
    case 'irreparable':
      return 'SCRAP';
    case 'obsolete':
      return 'OBSOLETO';
    default:
      return (status || 'DESCONOCIDO').toUpperCase().replace(/_/g, ' ');
  }
}

/** Cajas operativas de Gestión de Bodega (excluye taller, scrap, despacho, eliminado). */
export function isBodegaOperationalRack(rack: string | null | undefined): boolean {
  const r = String(rack || '').trim().toUpperCase();
  if (!r) return true;
  if (r === 'ELIMINADO' || r === 'DESPACHO' || r === 'SCRAP') return false;
  if (r.startsWith('TALLER')) return false;
  return true;
}

const WAREHOUSE_READY_RECEPTION_STATUSES = new Set([
  'CLASIFICADA',
  'PROCESADO',
  'RECIBIDO_BACKOFFICE',
  'RECIBIDO',
  'PENDIENTE DE CLASIFICAR',
  'PENDIENTE_CLASIFICAR',
]);

/** Reception classified (Backoffice or PX) and eligible for physical warehouse scan. */
export function isReceptionReadyForWarehouseIngreso(
  reception: { status?: string | null; source?: string | null } | null | undefined,
  hasServiceOrder: boolean
): boolean {
  if (!reception) return false;
  if (hasServiceOrder) return true;
  const status = (reception.status || '').trim();
  return WAREHOUSE_READY_RECEPTION_STATUSES.has(status);
}

export function isSeriesPendingWarehouseIngreso(seriesStatus?: string | null): boolean {
  return seriesStatus === 'RECEPCIONADO_BODEGA_GENERAL';
}

export function isSeriesInCentralWarehouse(seriesStatus?: string | null): boolean {
  return seriesStatus === 'in_central_warehouse';
}

export function canScanSeriesIntoWarehouse(
  reception: { status?: string | null; source?: string | null } | null | undefined,
  hasServiceOrder: boolean,
  seriesStatus?: string | null
): { ok: true } | { ok: false; reason: 'already_ingresado' | 'not_ready' } {
  if (isSeriesInCentralWarehouse(seriesStatus)) {
    return { ok: false, reason: 'already_ingresado' };
  }
  if (
    isReceptionReadyForWarehouseIngreso(reception, hasServiceOrder) ||
    isSeriesPendingWarehouseIngreso(seriesStatus)
  ) {
    return { ok: true };
  }
  return { ok: false, reason: 'not_ready' };
}

// Límite de paginación para lecturas de inventario. Debe superar el total de
// series físicas en bodega central/L3 (las funciones igualmente cortan cuando
// la página viene incompleta, así que esto sólo es una cota de seguridad).
const WAREHOUSE_BOX_FETCH_LIMIT = 200000;

function chunkIds(ids: string[], size = 80): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

/** PostgREST suele devolver solo `message` en consola; unimos detalle útil para el operador. */
function formatSupabaseError(error: {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(' — ') || 'Error desconocido';
}

type WarehouseOperator = { operatorId: string | null; userName: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Nunca enviar "" a columnas/params UUID (error 22P02).
 * `warehouse_movements.performed_by` es uuid → profiles(id).
 * También acepta valores no-string (evita String(null) → "null").
 */
export function asUuidOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const v = String(value).trim();
  if (!v || v === 'null' || v === 'undefined' || v === '""') return null;
  if (!UUID_RE.test(v)) return null;
  return v;
}

/** Params RPC: omite claves UUID vacías (PostgREST no recibe ""). */
export function withUuidParams<T extends Record<string, unknown>>(
  params: T,
  uuidKeys: (keyof T)[]
): T {
  const out = { ...params };
  for (const key of uuidKeys) {
    const normalized = asUuidOrNull(out[key] as unknown);
    if (normalized == null) {
      (out as Record<string, unknown>)[key as string] = null;
    } else {
      (out as Record<string, unknown>)[key as string] = normalized;
    }
  }
  return out;
}

/**
 * `warehouse_movements.performed_by` referencia `profiles(id)`.
 * Si el auth uid no tiene fila en profiles, enviar el uuid rompe la FK (400).
 */
async function resolveWarehouseOperator(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>
): Promise<WarehouseOperator> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { operatorId: null, userName: 'Operador' };
  }

  const fallbackName =
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    user.email ||
    'Operador';

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.id) {
    return {
      operatorId: asUuidOrNull(profile.id),
      userName: profile.full_name?.trim() || fallbackName,
    };
  }

  return { operatorId: null, userName: fallbackName };
}

async function fetchSeriesForBoxes(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  boxIds: string[]
) {
  if (boxIds.length === 0) return [] as any[];

  // 1) Series PLANAS (sin joins anidados — los embeds de PostgREST sobre
  //    decenas de miles de filas son el principal cuello de botella). Las
  //    relaciones (receptions / service_orders / models) se resuelven luego
  //    con consultas por lote y se atan en cliente, conservando la misma forma.
  const pageSize = 1000;
  // Proyección explícita (en vez de select('*')): este escaneo recorre TODA la
  // bodega central (tabla `series`, la que más crece). Pedir solo las columnas
  // que consume la página de bodega evita traer campos pesados/inútiles como
  // `current_diagnostics`, `s2/s3/s4`, `sap_transfer_id`, etc. → menos egress.
  // (Función privada: su único consumidor es getInventoryBoxes → bodega/gestion,
  //  que mapea a objetos explícitos; los crudos no se propagan a hijos.)
  const SERIES_COLS =
    'id, serial_number, current_status, current_box_id, current_reception_id, service_order_id, model_id, brand_id, material, valuation, notes, sap_status, created_at';
  const fetchChunkSeries = async (chunk: string[]) => {
    const out: any[] = [];
    let offset = 0;
    while (offset < WAREHOUSE_BOX_FETCH_LIMIT) {
      const { data, error } = await supabase
        .from('series')
        .select(SERIES_COLS)
        .in('current_box_id', chunk)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) {
        console.error('Error fetching series for boxes:', error);
        break;
      }
      if (data) out.push(...data);
      if (!data || data.length < pageSize) break;
      offset += pageSize;
    }
    return out;
  };
  const chunkResults = await Promise.all(chunkIds(boxIds).map(fetchChunkSeries));
  const allSeries: any[] = chunkResults.flat();

  // 2) Resolver relaciones con consultas pequeñas por lote
  const recIds = [...new Set(allSeries.map((s) => s.current_reception_id).filter(Boolean))];
  const osIds = [...new Set(allSeries.map((s) => s.service_order_id).filter(Boolean))];
  const modelIds = [...new Set(allSeries.map((s) => s.model_id).filter(Boolean))];

  const fetchMap = async (table: string, ids: string[], cols: string) => {
    const map = new Map<string, any>();
    const results = await Promise.all(
      chunkIds(ids, 80).map((c) => supabase.from(table).select(cols).in('id', c))
    );
    for (const { data } of results) for (const row of data || []) map.set((row as any).id, row);
    return map;
  };

  const [recMap, osMap, modelMap] = await Promise.all([
    fetchMap('receptions', recIds, 'id, guide_number, notes, carrier, received_by, status, created_at, source'),
    fetchMap('service_orders', osIds, 'id, os_label, reentry_count, sap_integration_status'),
    fetchMap('models', modelIds, 'id, name, technology_id, brand_id, technologies (name)'),
  ]);

  // 3) Atar relaciones a cada serie (misma forma que el embed original)
  for (const s of allSeries) {
    s.receptions = s.current_reception_id ? recMap.get(s.current_reception_id) || null : null;
    s.service_orders = s.service_order_id ? osMap.get(s.service_order_id) || null : null;
    s.models = s.model_id ? modelMap.get(s.model_id) || null : null;
  }
  return allSeries;
}

async function fetchAllCentralWarehouseBoxes(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>
) {
  const boxesById = new Map<string, Record<string, unknown>>();
  const pageSize = 1000;
  let offset = 0;

  while (offset < WAREHOUSE_BOX_FETCH_LIMIT) {
    const { data, error } = await supabase
      .from('boxes')
      .select(BOX_MINIMAL_SELECT)
      .or('rack_location.eq.BODEGA_CENTRAL,rack_location.like.P-*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching warehouse boxes:', error);
      break;
    }
    if (!data?.length) break;

    for (const box of data) {
      const rack = String(box.rack_location || '').toUpperCase();
      if (rack !== 'DESPACHO' && rack !== 'ELIMINADO') {
        boxesById.set(box.id as string, box);
      }
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return boxesById;
}

async function fetchBoxesByIds(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  boxIds: string[]
) {
  const boxesById = new Map<string, Record<string, unknown>>();
  for (const chunk of chunkIds(boxIds)) {
    const { data, error } = await supabase.from('boxes').select(BOX_MINIMAL_SELECT).in('id', chunk);
    if (error) {
      console.error('Error fetching boxes by id:', error);
      continue;
    }
    for (const box of data || []) {
      const rack = String(box.rack_location || '').toUpperCase();
      if (rack !== 'DESPACHO') boxesById.set(box.id as string, box);
    }
  }
  return boxesById;
}

async function fetchWarehouseSeriesBoxIds(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>
) {
  const boxIds = new Set<string>();
  const pageSize = 1000;

  // Conteo para lanzar las páginas en paralelo (en vez de secuencial).
  const { count, error: countError } = await supabase
    .from('series')
    .select('current_box_id', { count: 'exact', head: true })
    .eq('current_status', 'in_central_warehouse')
    .not('current_box_id', 'is', null);

  if (countError || !count) {
    if (countError) console.error('Error counting warehouse series:', countError);
    return boxIds;
  }

  const pages = Math.min(Math.ceil(count / pageSize), Math.ceil(WAREHOUSE_BOX_FETCH_LIMIT / pageSize));
  const results = await Promise.all(
    Array.from({ length: pages }, (_, p) =>
      supabase
        .from('series')
        .select('current_box_id')
        .eq('current_status', 'in_central_warehouse')
        .not('current_box_id', 'is', null)
        .order('current_box_id', { ascending: true })
        .order('id', { ascending: true })
        .range(p * pageSize, p * pageSize + pageSize - 1)
    )
  );
  for (const { data } of results) {
    for (const row of data || []) {
      if (row.current_box_id) boxIds.add(row.current_box_id as string);
    }
  }

  return boxIds;
}

// Caché en memoria (vida de la sesión SPA) del inventario completo. Evita
// re-descargar ~12 MB (24k+ series) cuando el usuario navega fuera y vuelve a
// Bodega en una ventana corta. Se invalida tras cualquier mutación (force) y al
// vencer el TTL. NO persiste entre recargas completas de página.
const INVENTORY_CACHE_TTL_MS = 120_000; // 2 min (ajustable)
let inventoryCache: { at: number; payload: { data: any[] } } | null = null;

export function invalidateInventoryBoxesCache() {
  inventoryCache = null;
}

export async function getInventoryBoxes(options?: { force?: boolean }) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  if (
    !options?.force &&
    inventoryCache &&
    Date.now() - inventoryCache.at < INVENTORY_CACHE_TTL_MS
  ) {
    return inventoryCache.payload;
  }

  // 1) Cajas por rack operativo
  const boxesById = await fetchAllCentralWarehouseBoxes(supabase);

  // 2) Respaldo: cualquier caja referenciada por series en bodega (paginado, evita límite 1000)
  const seriesBoxIds = await fetchWarehouseSeriesBoxIds(supabase);
  const missingFromRack = [...seriesBoxIds].filter((id) => !boxesById.has(id));
  if (missingFromRack.length > 0) {
    const extra = await fetchBoxesByIds(supabase, missingFromRack);
    for (const [id, box] of extra) {
      const rack = String(box.rack_location || '').toUpperCase();
      if (rack !== 'DESPACHO' && rack !== 'ELIMINADO') {
        boxesById.set(id, box);
      }
    }
  }

  // 3) Series completas por caja (chunks pequeños)
  const allBoxIds = [...boxesById.keys()];
  if (allBoxIds.length === 0) {
    const empty = { data: [] as any[] };
    inventoryCache = { at: Date.now(), payload: empty };
    return empty;
  }

  const allSeries = await fetchSeriesForBoxes(supabase, allBoxIds);
  const seriesByBoxId = new Map<string, any[]>();
  for (const row of allSeries) {
    const boxId = row.current_box_id as string | null;
    if (!boxId) continue;
    const bucket = seriesByBoxId.get(boxId) || [];
    bucket.push(row);
    seriesByBoxId.set(boxId, bucket);
  }

  const data = [...boxesById.values()]
    .map((box) => ({
      ...box,
      series: seriesByBoxId.get(box.id as string) || [],
    }))
    .filter((box: Record<string, any>) => {
      const rack = String(box.rack_location || '').toUpperCase();
      if (rack === 'ELIMINADO' || rack === 'DESPACHO' || rack === 'SCRAP') return false;
      if (rack.startsWith('TALLER')) return false;
      // Inventario operativo = cajas con al menos una serie en bodega
      return (box.series as any[])?.length > 0;
    })
    .sort(
      (a: Record<string, any>, b: Record<string, any>) =>
        new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime()
    );

  const payload = { data };
  inventoryCache = { at: Date.now(), payload };
  return payload;
}

/** Estatus visual alineado al KPI: cuenta equipos OS vs capacidad (no filas S1–S4). */
export function resolveBoxDisplayStatus(equiposCount: number, capacity: number): 'Vacía' | 'Parcial' | 'Full' {
  const cap = capacity > 0 ? capacity : 1;
  if (equiposCount <= 0) return 'Vacía';
  if (equiposCount >= cap) return 'Full';
  return 'Parcial';
}

/** Pistoleo incremental: crea TMP en EN_PROCESO o agrega series a la sesión. */
export async function startOrAppendBodegaScan(input: {
  boxId?: string | null;
  receptionId: string;
  brandId: string;
  modelId: string;
  capacity: number;
  serialNumbers: string[];
}): Promise<{
  data?: { box_id: string; box_code: string; series_linked: number; equipos_count?: number };
  error?: string;
}> {
  invalidateInventoryBoxesCache();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const uniqueSeries = [...new Set((input.serialNumbers || []).map((s) => s?.trim().toUpperCase()).filter(Boolean))];
  if (uniqueSeries.length === 0) {
    return { error: 'Debe escanear al menos una serie.' };
  }

  const { data, error } = await supabase.rpc('bodega_start_or_append_scan_tx', {
    p_box_id: input.boxId || null,
    p_reception_id: input.receptionId,
    p_brand_id: input.brandId,
    p_model_id: input.modelId,
    p_capacity: input.capacity,
    p_serial_numbers: uniqueSeries,
    p_rack_location: 'EN_PROCESO',
  });

  if (error) return { error: error.message };
  const row = data as { box_id: string; box_code: string; series_linked: number; equipos_count?: number };
  return { data: row };
}

/** Asigna BOX-{n} oficial y saca la caja de EN_PROCESO. */
export async function finalizeBodegaScan(input: {
  boxId: string;
  rackLocation?: string;
}): Promise<{ data?: { box_id: string; box_code: string; series_linked: number }; error?: string }> {
  invalidateInventoryBoxesCache();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const { data, error } = await supabase.rpc('bodega_finalize_scan_tx', {
    p_box_id: input.boxId,
    p_rack_location: input.rackLocation || 'P-01',
  });

  if (error) return { error: error.message };
  return { data: data as { box_id: string; box_code: string; series_linked: number } };
}

/** Cancela pistoleo TMP: desvincula series y marca ELIMINADO. */
export async function cancelBodegaScan(boxId: string): Promise<{ error?: string }> {
  invalidateInventoryBoxesCache();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const { error } = await supabase.rpc('bodega_cancel_scan_tx', { p_box_id: boxId });
  if (error) return { error: error.message };
  return {};
}

export async function listInProgressBodegaBoxes(limit = 50): Promise<{
  data?: Array<{
    box_id: string;
    label: string;
    rack: string;
    series_count: number;
    equipos_count: number;
    capacity: number;
    brand_id?: string;
    model_id?: string;
    sample_brand_id?: string;
    sample_model_id?: string;
  }>;
  error?: string;
}> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const { data, error } = await supabase.rpc('warehouse_list_in_progress_boxes', {
    p_limit: limit,
  });
  if (error) return { error: error.message };
  return { data: (data || []) as any };
}

export async function requestBoxDeletion(input: {
  boxId: string;
  reason: string;
  observations?: string;
}): Promise<{ data?: { request_id: string; box_code?: string; message?: string }; error?: string }> {
  invalidateInventoryBoxesCache();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const { data, error } = await supabase.rpc('bodega_request_box_deletion_tx', {
    p_box_id: input.boxId,
    p_reason: input.reason,
    p_observations: input.observations || null,
  });
  if (error) return { error: error.message.replace(/^[^:]+:\s*/i, '') };
  return { data: data as { request_id: string; box_code?: string; message?: string } };
}

export async function reviewBoxDeletion(input: {
  requestId: string;
  decision: 'approve' | 'reject';
  reviewNotes?: string;
}): Promise<{ data?: { status: string; box_id: string }; error?: string }> {
  invalidateInventoryBoxesCache();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const { data, error } = await supabase.rpc('bodega_review_box_deletion_tx', {
    p_request_id: input.requestId,
    p_decision: input.decision,
    p_review_notes: input.reviewNotes || null,
  });
  if (error) return { error: error.message.replace(/^[^:]+:\s*/i, '') };
  return { data: data as { status: string; box_id: string } };
}

export async function listBoxDeletionRequests(status: string = 'pending', limit = 50) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured', data: [] as any[] };

  const { data, error } = await supabase.rpc('bodega_list_box_deletion_requests', {
    p_status: status,
    p_limit: limit,
  });
  if (error) return { error: error.message, data: [] as any[] };
  return { data: (data || []) as any[] };
}

export async function createBodegaBoxAtomic(input: {
  receptionId: string;
  brandId: string;
  modelId: string;
  capacity: number;
  rackLocation?: string;
  serialNumbers: string[];
  boxCode?: string | null;
}): Promise<{ data?: { box_id: string; box_code: string; series_linked: number }; error?: string }> {
  invalidateInventoryBoxesCache();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const uniqueSeries = [...new Set((input.serialNumbers || []).map((s) => s?.trim().toUpperCase()).filter(Boolean))];
  if (uniqueSeries.length === 0) {
    return { error: 'No se puede crear una caja sin series escaneadas.' };
  }

  const { data, error } = await supabase.rpc('create_bodega_box_tx', {
    p_reception_id: input.receptionId,
    p_brand_id: input.brandId,
    p_model_id: input.modelId,
    p_capacity: input.capacity,
    p_rack_location: input.rackLocation || 'P-01',
    p_serial_numbers: uniqueSeries,
    p_box_code: input.boxCode || null,
  });

  if (error) {
    const msg = error.message || 'Error al crear caja en bodega';
    if (msg.includes('NO_SERIES_LINKED')) {
      return { error: 'Ninguna serie pudo vincularse. Verifique que estén clasificadas en Backoffice o PX.' };
    }
    return { error: msg.replace(/^[^:]+:\s*/i, '') };
  }

  const payload = data as { box_id: string; box_code: string; series_linked: number };
  return { data: payload };
}

export async function reserveNextBoxCode(): Promise<{ code?: string; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };
  const { data, error } = await supabase.rpc('next_box_code');
  if (error || !data) return { error: error?.message || 'No se pudo reservar correlativo' };
  return { code: data as string };
}

function normalizeBoxCorrelative(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Reserva correlativo BOX vía `next_box_code` (secuencia global compartida
 * bodega/PX/warehouse). Los códigos son irrepetibles en BD; el set `takenCodes`
 * solo evita colisión con filas aún no refrescadas en pantalla.
 */
export async function reserveNextBoxCodeForInventory(
  takenCodes: string[] = [],
  maxAttempts = 5
): Promise<{ code?: string; error?: string }> {
  const taken = new Set(
    takenCodes.map((c) => normalizeBoxCorrelative(c)).filter((c) => /^BOX-[0-9]+$/.test(c))
  );
  let lastCollision = '';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await reserveNextBoxCode();
    if (result.error || !result.code) return result;

    const code = normalizeBoxCorrelative(result.code);
    if (!taken.has(code)) {
      return { code };
    }
    lastCollision = code;
  }

  return {
    error: lastCollision
      ? `No hay correlativo libre (${lastCollision} ya existe). Espere un momento e intente de nuevo.`
      : 'No se pudo reservar correlativo de caja.',
  };
}

export async function createBoxWithSeries(boxData: any, seriesNumbers: string[]) {
  invalidateInventoryBoxesCache();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const uniqueSeries = [...new Set((seriesNumbers || []).map((s) => s?.trim()).filter(Boolean))];
  if (uniqueSeries.length === 0) {
    return { error: 'No se puede crear una caja sin series escaneadas.' };
  }

  if (!boxData.reception_id) {
    return { error: 'Falta la recepción de origen para crear la caja.' };
  }

  // 1. Create the box
  const { data: box, error: boxError } = await supabase
    .from('boxes')
    .insert([boxData])
    .select()
    .single();

  if (boxError) return { error: boxError.message };

  // 2. Link series to this box and update their status
  const { data: linked, error: seriesError } = await supabase
    .from('series')
    .update({ 
      current_box_id: box.id,
      current_status: 'in_central_warehouse'
    })
    .in('serial_number', uniqueSeries)
    .select('id');

  if (seriesError) {
    await supabase.from('boxes').update({ rack_location: 'ELIMINADO' }).eq('id', box.id);
    return { error: seriesError.message };
  }

  if (!linked?.length) {
    await supabase.from('boxes').update({ rack_location: 'ELIMINADO' }).eq('id', box.id);
    return { error: 'Ninguna serie válida pudo vincularse a la caja. Verifique que estén clasificadas en Backoffice.' };
  }

  await syncSapTransferIngresadoForSeries(
    supabase,
    linked.map((row) => row.id)
  );

  return { data: box };
}

export async function addSeriesToBox(boxId: string, seriesNumbers: string[]) {
  invalidateInventoryBoxesCache();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { data: linked, error: seriesError } = await supabase
    .from('series')
    .update({ 
      current_box_id: boxId,
      current_status: 'in_central_warehouse'
    })
    .in('serial_number', seriesNumbers)
    .select('id');

  if (seriesError) return { error: seriesError.message };

  if (linked?.length) {
    await syncSapTransferIngresadoForSeries(
      supabase,
      linked.map((row) => row.id)
    );
  }

  return { success: true };
}

/** Máximo de cajas por lote hacia taller (dispersión = 1 RPC pesado por caja). */
export const WORKSHOP_TRANSFER_BATCH_LIMIT = BATCH_LIMITS.WORKSHOP_TRANSFER_BOXES;

export async function transferBoxesToArea(boxIds: string[], targetArea: string, targetRack?: string) {
  invalidateInventoryBoxesCache();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { operatorId, userName } = await resolveWarehouseOperator(supabase);

  const rackFromArea = AREA_TO_RACK[targetArea];
  const rackLocation = targetRack ?? rackFromArea;
  const isWorkshop = rackLocation?.startsWith('TALLER');

  if (isWorkshop && isWarehouseTransferApiEnabled()) {
    const apiResult = await transferBoxesToWorkshopViaApi(boxIds);
    if (!apiResult.success) {
      return { error: apiResult.error ?? 'Transferencia fallida' };
    }
    return { success: true, seriesUpdated: apiResult.transferred ?? boxIds.length };
  }

  if (isWorkshop && boxIds.length > WORKSHOP_TRANSFER_BATCH_LIMIT) {
    return {
      error: `Máximo ${WORKSHOP_TRANSFER_BATCH_LIMIT} cajas por lote hacia Diagnóstico. Seleccionó ${boxIds.length}; divida en grupos más pequeños.`,
    };
  }

  let successCount = 0;
  let lastError: string | null = null;
  for (const boxId of boxIds) {
    if (isWorkshop) {
      const idempotencyKey = warehouseBoxIdempotencyKey(boxId, "dispersion", "taller");
      const { data, error } = await supabase.rpc(
        'warehouse_dispersion_tx',
        withUuidParams(
          {
            p_box_id: boxId,
            p_target_module: 'taller',
            p_operator_id: operatorId,
            p_operator_name: userName,
            p_idempotency_key: idempotencyKey,
          },
          ['p_box_id', 'p_operator_id', 'p_idempotency_key']
        )
      );
      if (!error) successCount++;
      else if (String(error.message || '').includes('ALREADY_DISPERSED')) {
        successCount++;
      } else {
        lastError = formatSupabaseError(error);
        console.error('Error in dispersion:', error, data);
      }
    } else {
      const idempotencyKey = warehouseBoxIdempotencyKey(boxId, "traslado", rackLocation);
      const { error } = await supabase.rpc('warehouse_traslado_tx', {
        p_box_id: boxId,
        p_target_location: rackLocation,
        p_operator_id: asUuidOrNull(operatorId),
        p_operator_name: userName,
        p_idempotency_key: idempotencyKey
      });
      if (!error) successCount++;
      else {
        lastError = formatSupabaseError(error);
        console.error('Error in traslado:', error);
      }
    }
  }

  if (successCount === 0 && lastError) {
    return { error: lastError };
  }
  if (successCount < boxIds.length && lastError) {
    return { error: `${successCount}/${boxIds.length} cajas movidas. Último error: ${lastError}` };
  }

  return { success: true, seriesUpdated: successCount };
}

function chunkBoxIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export type BatchTransferResult = {
  success: boolean;
  transferred: number;
  total: number;
  batches: number;
  error?: string;
};

/**
 * Traslado a área con auto-lotes hacia Diagnóstico/taller (máx. WORKSHOP_TRANSFER_BATCH_LIMIT por RPC).
 */
export async function transferBoxesToAreaInBatches(
  boxIds: string[],
  targetArea: string,
  targetRack?: string
): Promise<BatchTransferResult> {
  if (boxIds.length === 0) {
    return { success: false, transferred: 0, total: 0, batches: 0, error: 'Sin cajas seleccionadas' };
  }

  const rackFromArea = AREA_TO_RACK[targetArea];
  const rackLocation = targetRack ?? rackFromArea;
  const isWorkshop = rackLocation?.startsWith('TALLER');

  const chunks =
    isWorkshop && boxIds.length > WORKSHOP_TRANSFER_BATCH_LIMIT
      ? chunkBoxIds(boxIds, WORKSHOP_TRANSFER_BATCH_LIMIT)
      : [boxIds];

  let transferred = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const result = await transferBoxesToArea(chunk, targetArea, targetRack);
    if (result.error) {
      const batchLabel = chunks.length > 1 ? ` — lote ${i + 1}/${chunks.length}` : '';
      if (transferred === 0) {
        return {
          success: false,
          transferred: 0,
          total: boxIds.length,
          batches: chunks.length,
          error: `${result.error}${batchLabel}`,
        };
      }
      return {
        success: false,
        transferred,
        total: boxIds.length,
        batches: chunks.length,
        error: `${transferred}/${boxIds.length} cajas movidas antes del fallo${batchLabel}: ${result.error}`,
      };
    }
    transferred += chunk.length;
  }

  return {
    success: true,
    transferred,
    total: boxIds.length,
    batches: chunks.length,
  };
}

export async function openDispatchBatch(destination?: string, guideOutbound?: string, notes?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const { operatorId, userName } = await resolveWarehouseOperator(supabase);

  const { data, error } = await supabase.rpc('dispatch_batch_open_tx', {
    p_destination: destination || null,
    p_guide_outbound: guideOutbound || null,
    p_operator_id: asUuidOrNull(operatorId),
    p_operator_name: userName,
    p_notes: notes || null,
  });

  if (error) return { error: error.message };
  return { data: data as { batch_id: string; batch_number: string; status: string } };
}

export async function closeDispatchBatch(batchId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const { operatorId, userName } = await resolveWarehouseOperator(supabase);

  const { data, error } = await supabase.rpc('dispatch_batch_close_tx', {
    p_batch_id: batchId,
    p_operator_id: asUuidOrNull(operatorId),
    p_operator_name: userName,
  });

  if (error) return { error: error.message };
  return { data };
}

export async function dispatchBoxFromWarehouse(
  boxId: string,
  destination: string,
  notes?: string,
  dispatchBatchId?: string,
  guideNumber?: string
) {
  invalidateInventoryBoxesCache();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { operatorId, userName } = await resolveWarehouseOperator(supabase);

  const guide = (guideNumber?.trim() || destination || '').trim();
  const { error } = await supabase.rpc('warehouse_salida_tx', {
    p_box_id: boxId,
    p_destination: destination,
    p_guide_number: guide,
    p_operator_id: asUuidOrNull(operatorId),
    p_operator_name: userName,
    p_idempotency_key: warehouseBoxIdempotencyKey(boxId, "salida", `${guide}|${destination}`),
    p_dispatch_batch_id: asUuidOrNull(dispatchBatchId),
  });

  if (error) return { error: error.message };

  return { success: true };
}

export async function transferSpecificSeriesToArea(boxId: string, seriesNumbers: string[], targetArea: string, userId?: string) {
  invalidateInventoryBoxesCache();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const rackFromArea = AREA_TO_RACK[targetArea];
  const targetLocation = rackFromArea || targetArea;
  let nextStatus = AREA_TO_SERIES_STATUS[targetArea] || 'in_central_warehouse';

  const { operatorId, userName: resolvedName } = await resolveWarehouseOperator(supabase);
  const userName = resolvedName || userId || 'Operador';

  const uniqueSeries = [...new Set((seriesNumbers || []).map((s) => s?.trim().toUpperCase()).filter(Boolean))];
  if (uniqueSeries.length === 0) {
    return { error: 'Debe seleccionar al menos una serie.' };
  }

  const { data, error } = await supabase.rpc('warehouse_traslado_parcial_tx', {
    p_box_id: boxId,
    p_serial_numbers: uniqueSeries,
    p_target_location: targetLocation,
    p_target_status: nextStatus,
    p_operator_id: asUuidOrNull(operatorId),
    p_operator_name: userName,
    p_idempotency_key: warehouseBoxIdempotencyKey(
      boxId,
      'traslado',
      `${targetLocation}:${uniqueSeries.sort().join(',')}`
    ),
  });

  if (error) return { error: error.message };

  const payload = data as { series_count?: number };
  if (payload?.series_count) {
    const { logAudit } = await import('@/lib/database/audit');
    const { data: moved } = await supabase
      .from('series')
      .select('id')
      .in('serial_number', uniqueSeries);
    for (const s of moved || []) {
      await logAudit('series', s.id, 'TRASLADO', { status: nextStatus, fromBox: boxId });
    }
  }

  return { success: true };
}

export async function dispatchSpecificSeries(
  boxId: string,
  seriesNumbers: string[],
  destination: string,
  notes?: string,
  dispatchBatchId?: string
) {
  invalidateInventoryBoxesCache();
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { operatorId, userName } = await resolveWarehouseOperator(supabase);

  const uniqueSeries = [...new Set((seriesNumbers || []).map((s) => s?.trim().toUpperCase()).filter(Boolean))];
  if (uniqueSeries.length === 0) {
    return { error: 'Debe seleccionar al menos una serie.' };
  }

  const { data: targetSeries, error: fetchError } = await supabase
    .from('series')
    .select('id')
    .in('serial_number', uniqueSeries);

  if (fetchError) return { error: fetchError.message };

  const { data, error } = await supabase.rpc('warehouse_salida_parcial_tx', {
    p_box_id: boxId,
    p_serial_numbers: uniqueSeries,
    p_destination: destination || '',
    p_guide_number: destination || '',
    p_operator_id: asUuidOrNull(operatorId),
    p_operator_name: userName,
    p_notes: notes || null,
    p_idempotency_key: warehouseBoxIdempotencyKey(
      boxId,
      'salida',
      `${destination}:${uniqueSeries.sort().join(',')}`
    ),
    p_dispatch_batch_id: asUuidOrNull(dispatchBatchId),
  });

  if (error) return { error: error.message };

  const payload = data as { dispatch_id?: string };
  if (payload?.dispatch_id && targetSeries?.length) {
    const { logAudit } = await import('@/lib/database/audit');
    for (const s of targetSeries) {
      await logAudit('series', s.id, 'DESPACHO CREADO', { dispatch_id: payload.dispatch_id, destination });
    }
  }

  return { success: true };
}

export async function getInventoryDetails() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  // 1. Cajas físicamente en bodega (excluir despacho, eliminado y racks de taller)
  const { data: warehouseBoxes, error: boxError } = await supabase
    .from("boxes")
    .select("id, rack_location")
    .not("rack_location", "in", '("DESPACHO","ELIMINADO")')
    .not("rack_location", "ilike", "TALLER%");

  if (boxError) {
    console.error("Error fetching closed boxes:", boxError);
    return { error: boxError.message };
  }

  const warehouseBoxIds = (warehouseBoxes || [])
    .filter((b: { rack_location?: string | null }) => {
      const rack = (b.rack_location || '').toUpperCase();
      return !rack.startsWith('SCRAP') && !rack.startsWith('OBSOLETO');
    })
    .map((b: { id: string }) => b.id);

  if (warehouseBoxIds.length === 0) {
    return { data: [] };
  }

  const seriesSelect = `
    *,
    boxes (id, box_code, status, rack_location, created_at),
    service_orders (os_label, sap_integration_status),
    receptions (
        guide_number,
        notes,
        carrier,
        received_by,
        status,
        created_at,
        source,
        reception_guides (guide_number, agency, category)
      ),
    brands (name),
    models (name, technologies (name))
  `;

  const pageSize = 1000;
  const allSeries: any[] = [];
  for (const chunk of chunkIds(warehouseBoxIds)) {
    let offset = 0;
    while (offset < WAREHOUSE_BOX_FETCH_LIMIT) {
      const { data: seriesData, error: seriesError } = await supabase
        .from('series')
        .select(seriesSelect)
        .in('current_box_id', chunk)
        .in('current_status', [...WAREHOUSE_INVENTORY_STATUSES])
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (seriesError) {
        console.error('Error fetching inventory details:', seriesError);
        break;
      }
      if (!seriesData?.length) break;
      allSeries.push(...seriesData);
      if (seriesData.length < pageSize) break;
      offset += pageSize;
    }
  }

  const warehouseOnly = allSeries.filter((row: { current_status?: string; boxes?: { rack_location?: string } }) => {
    const rack = (row.boxes?.rack_location || '').toUpperCase();
    if (rack.startsWith('TALLER')) return false;
    return (WAREHOUSE_INVENTORY_STATUSES as readonly string[]).includes(row.current_status || '');
  });

  return { data: warehouseOnly };
}

export async function getBoxHistory(boxId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: [] };
  const { data, error } = await supabase.rpc('warehouse_get_box_history', { p_box_id: boxId });
  if (error) {
    console.error('Error fetching box history:', error);
    return { data: [] };
  }
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return { data: list };
}

