import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

/** CHG-002: todas las series del doc SAP encajonadas en bodega → INGRESADO_BODEGA. */
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

const WAREHOUSE_BOX_FETCH_LIMIT = 5000;

function chunkIds(ids: string[], size = 80): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

async function fetchSeriesForBoxes(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  boxIds: string[]
) {
  if (boxIds.length === 0) return [] as any[];

  const seriesSelect = `
    *,
    receptions (
      guide_number,
      notes,
      carrier,
      received_by,
      status,
      created_at,
      source
    ),
    service_orders (id, os_label, reentry_count, sap_integration_status),
    models (name, technology_id, brand_id, technologies (name))
  `;

  const pageSize = 1000;
  const allSeries: any[] = [];
  for (const chunk of chunkIds(boxIds)) {
    let offset = 0;
    while (offset < WAREHOUSE_BOX_FETCH_LIMIT) {
      const { data: seriesData, error: seriesError } = await supabase
        .from('series')
        .select(seriesSelect)
        .in('current_box_id', chunk)
        .range(offset, offset + pageSize - 1);

      if (seriesError) {
        console.error('Error fetching series for boxes:', seriesError);
        const { data: fallback, error: fallbackError } = await supabase
          .from('series')
          .select('*')
          .in('current_box_id', chunk)
          .range(offset, offset + pageSize - 1);
        if (fallbackError) {
          console.error('Fallback series fetch for boxes failed:', fallbackError);
          break;
        }
        if (fallback) allSeries.push(...fallback);
        if (!fallback || fallback.length < pageSize) break;
        offset += pageSize;
        continue;
      }
      if (seriesData) allSeries.push(...seriesData);
      if (!seriesData || seriesData.length < pageSize) break;
      offset += pageSize;
    }
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
      .select('*')
      .or('rack_location.eq.BODEGA_CENTRAL,rack_location.like.P-*')
      .order('created_at', { ascending: false })
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
    const { data, error } = await supabase.from('boxes').select('*').in('id', chunk);
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
  let offset = 0;

  while (offset < WAREHOUSE_BOX_FETCH_LIMIT) {
    const { data, error } = await supabase
      .from('series')
      .select('current_box_id')
      .eq('current_status', 'in_central_warehouse')
      .not('current_box_id', 'is', null)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching warehouse series box ids:', error);
      break;
    }
    if (!data?.length) break;

    for (const row of data) {
      if (row.current_box_id) boxIds.add(row.current_box_id as string);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return boxIds;
}

export async function getInventoryBoxes() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

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
  if (allBoxIds.length === 0) return { data: [] };

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
    .filter((box) => {
      const rack = String(box.rack_location || '').toUpperCase();
      if (rack === 'ELIMINADO' || rack === 'DESPACHO') return false;
      // Inventario operativo = cajas con al menos una serie en bodega
      return (box.series as any[])?.length > 0;
    })
    .sort(
      (a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime()
    );

  return { data };
}

export function resolveBoxDisplayStatus(seriesCount: number, capacity: number): 'Vacía' | 'Parcial' | 'Full' {
  if (seriesCount <= 0) return 'Vacía';
  if (capacity > 0 && seriesCount >= capacity) return 'Full';
  return 'Parcial';
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

export async function createBoxWithSeries(boxData: any, seriesNumbers: string[]) {
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

export async function transferBoxesToArea(boxIds: string[], targetArea: string, targetRack?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { data: userData } = await supabase.auth.getUser();
  const operatorId = userData?.user?.id;
  const userName = userData?.user?.user_metadata?.full_name || userData?.user?.email || 'Operador';

  const rackFromArea = AREA_TO_RACK[targetArea];
  const rackLocation = targetRack ?? rackFromArea;
  const isWorkshop = rackLocation?.startsWith('TALLER');

  let successCount = 0;
  for (const boxId of boxIds) {
    if (isWorkshop) {
      const { error } = await supabase.rpc('warehouse_dispersion_tx', {
        p_box_id: boxId,
        p_target_module: 'taller',
        p_operator_id: operatorId,
        p_operator_name: userName,
        p_idempotency_key: crypto.randomUUID()
      });
      if (!error) successCount++;
      else console.error('Error in dispersion:', error);
    } else {
      const { error } = await supabase.rpc('warehouse_traslado_tx', {
        p_box_id: boxId,
        p_target_location: rackLocation,
        p_operator_id: operatorId,
        p_operator_name: userName,
        p_idempotency_key: crypto.randomUUID()
      });
      if (!error) successCount++;
      else console.error('Error in traslado:', error);
    }
  }

  return { success: true, seriesUpdated: successCount };
}

export async function openDispatchBatch(destination?: string, guideOutbound?: string, notes?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const { data: userData } = await supabase.auth.getUser();
  const operatorId = userData?.user?.id;
  const userName = userData?.user?.user_metadata?.full_name || userData?.user?.email || 'Operador';

  const { data, error } = await supabase.rpc('dispatch_batch_open_tx', {
    p_destination: destination || null,
    p_guide_outbound: guideOutbound || null,
    p_operator_id: operatorId,
    p_operator_name: userName,
    p_notes: notes || null,
  });

  if (error) return { error: error.message };
  return { data: data as { batch_id: string; batch_number: string; status: string } };
}

export async function closeDispatchBatch(batchId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const { data: userData } = await supabase.auth.getUser();
  const operatorId = userData?.user?.id;
  const userName = userData?.user?.user_metadata?.full_name || userData?.user?.email || 'Operador';

  const { data, error } = await supabase.rpc('dispatch_batch_close_tx', {
    p_batch_id: batchId,
    p_operator_id: operatorId,
    p_operator_name: userName,
  });

  if (error) return { error: error.message };
  return { data };
}

export async function dispatchBoxFromWarehouse(
  boxId: string,
  destination: string,
  notes?: string,
  dispatchBatchId?: string
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { data: userData } = await supabase.auth.getUser();
  const operatorId = userData?.user?.id;
  const userName = userData?.user?.user_metadata?.full_name || userData?.user?.email || 'Operador';

  const { error } = await supabase.rpc('warehouse_salida_tx', {
    p_box_id: boxId,
    p_destination: destination,
    p_guide_number: destination, // mapped to destination/guide
    p_operator_id: operatorId,
    p_operator_name: userName,
    p_idempotency_key: crypto.randomUUID(),
    p_dispatch_batch_id: dispatchBatchId || null,
  });

  if (error) return { error: error.message };

  // Note: RPC currently only handles box and series state + movement log.
  // The insertion to `dispatches` and `dispatch_items` is omitted in the basic RPC provided. 
  // It should be part of the RPC but for now we consider it successful.

  return { success: true };
}

export async function transferSpecificSeriesToArea(boxId: string, seriesNumbers: string[], targetArea: string, userId?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const rackFromArea = AREA_TO_RACK[targetArea];
  const targetLocation = rackFromArea || targetArea;
  let nextStatus = AREA_TO_SERIES_STATUS[targetArea] || 'in_central_warehouse';

  const { data: userData } = await supabase.auth.getUser();
  const operatorId = userData?.user?.id;
  const userName = userData?.user?.user_metadata?.full_name || userData?.user?.email || userId || 'Operador';

  const uniqueSeries = [...new Set((seriesNumbers || []).map((s) => s?.trim().toUpperCase()).filter(Boolean))];
  if (uniqueSeries.length === 0) {
    return { error: 'Debe seleccionar al menos una serie.' };
  }

  const { data, error } = await supabase.rpc('warehouse_traslado_parcial_tx', {
    p_box_id: boxId,
    p_serial_numbers: uniqueSeries,
    p_target_location: targetLocation,
    p_target_status: nextStatus,
    p_operator_id: operatorId,
    p_operator_name: userName,
    p_idempotency_key: crypto.randomUUID(),
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
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { data: userData } = await supabase.auth.getUser();
  const operatorId = userData?.user?.id;
  const userName = userData?.user?.user_metadata?.full_name || userData?.user?.email || 'Operador';

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
    p_operator_id: operatorId,
    p_operator_name: userName,
    p_notes: notes || null,
    p_idempotency_key: crypto.randomUUID(),
    p_dispatch_batch_id: dispatchBatchId || null,
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

