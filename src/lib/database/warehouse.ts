import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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

export async function getInventoryBoxes() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('boxes')
    .select('*')
    .not('rack_location', 'in', '("DESPACHO","ELIMINADO")')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching boxes:", error);
    return { error: error.message };
  }
  if (!data) return [];

  const boxIds = data.map(b => b.id);
  
  let allSeries: any[] = [];
  if (boxIds.length > 0) {
    const { data: seriesData, error: seriesError } = await supabase
      .from('series')
      .select(`
        *,
        sap_status,
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
        service_orders (id, os_label, reentry_count, sap_integration_status)
      `)
      .in('current_box_id', boxIds);
      
    if (seriesError) {
      console.error("Error fetching series inside getInventoryBoxes:", seriesError);
    }
    if (seriesData) allSeries = seriesData;
  }

  return { data: data.map(box => ({
    ...box,
    series: allSeries.filter(s => s.current_box_id === box.id)
  })) };
}

export function resolveBoxDisplayStatus(seriesCount: number, capacity: number): 'Vacía' | 'Parcial' | 'Full' {
  if (seriesCount <= 0) return 'Vacía';
  if (capacity > 0 && seriesCount >= capacity) return 'Full';
  return 'Parcial';
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

  return { data: box };
}

export async function addSeriesToBox(boxId: string, seriesNumbers: string[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { error: seriesError } = await supabase
    .from('series')
    .update({ 
      current_box_id: boxId,
      current_status: 'in_central_warehouse'
    })
    .in('serial_number', seriesNumbers);

  if (seriesError) return { error: seriesError.message };

  return { success: true };
}

export async function transferBoxesToArea(boxIds: string[], targetArea: string, targetRack?: string, userId: string = 'Admin User') {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const nextStatus = AREA_TO_SERIES_STATUS[targetArea] ?? 'in_central_warehouse';
  const rackFromArea = AREA_TO_RACK[targetArea];
  const rackLocation = targetRack ?? rackFromArea;

  // 1. Actualizar ubicación de caja cuando sale de bodega central o cambia área
  if (rackLocation) {
    const { error: boxError } = await supabase
      .from('boxes')
      .update({ rack_location: rackLocation })
      .in('id', boxIds);

    if (boxError) return { error: boxError.message };
  }

  // 2. Series en la caja + hermanas de la misma OS (S-2, S-3, S-4 sin current_box_id)
  const { data: inBoxSeries, error: fetchErr } = await supabase
    .from('series')
    .select('id, service_order_id')
    .in('current_box_id', boxIds);

  if (fetchErr) return { error: fetchErr.message };

  const osIds = Array.from(
    new Set((inBoxSeries || []).map((s) => s.service_order_id).filter(Boolean))
  ) as string[];

  const { data: updatedSeries, error: seriesError } = await supabase
    .from('series')
    .update({ current_status: nextStatus })
    .in('current_box_id', boxIds)
    .select('id');

  if (seriesError) return { error: seriesError.message };

  let siblingUpdated: { id: string }[] = [];
  if (osIds.length > 0 && nextStatus !== 'in_central_warehouse') {
    const { data: siblings, error: siblingError } = await supabase
      .from('series')
      .update({ current_status: nextStatus })
      .in('service_order_id', osIds)
      .in('current_status', [...WAREHOUSE_INVENTORY_STATUSES])
      .select('id');

    if (siblingError) return { error: siblingError.message };
    siblingUpdated = siblings || [];
  }

  const allUpdatedIds = [
    ...new Set([...(updatedSeries || []).map((s) => s.id), ...siblingUpdated.map((s) => s.id)]),
  ];

  const { logAudit } = await import('@/lib/database/audit');

  if (allUpdatedIds.length) {
    for (const seriesId of allUpdatedIds) {
      if (nextStatus === 'in_central_warehouse') {
        await logAudit('series', seriesId, 'INGRESO BODEGA', {
          status: 'in_central_warehouse',
          boxIds,
          userId,
        });
      } else if (nextStatus === 'in_workshop') {
        await logAudit('series', seriesId, 'INGRESO A TALLER', {
          status: 'in_workshop',
          targetArea,
          boxIds,
          userId,
        });
      } else {
        await logAudit('series', seriesId, 'TRASLADO', {
          status: nextStatus,
          targetArea,
          boxIds,
          userId,
        });
      }
    }
  }

  return { success: true, seriesUpdated: allUpdatedIds.length };
}

export async function dispatchBoxFromWarehouse(boxId: string, destination: string, notes?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  // 1. Get the current user
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  // 2. Fetch all series in this box BEFORE updating them, so we can insert them into dispatch_items
  const { data: seriesInBox, error: fetchError } = await supabase
    .from('series')
    .select('id')
    .eq('current_box_id', boxId);
    
  if (fetchError) return { error: fetchError.message };

  // 3. Mark all series in the box as dispatched
  const { error: seriesError } = await supabase
    .from('series')
    .update({ current_status: 'dispatched' })
    .eq('current_box_id', boxId);

  if (seriesError) return { error: seriesError.message };

  // 4. Mark the box as dispatched
  const { error: boxError } = await supabase
    .from('boxes')
    .update({ 
      rack_location: 'DESPACHO'
    })
    .eq('id', boxId);

  if (boxError) return { error: boxError.message };

  // 5. Insert into dispatches
  const { data: dispatchRecord, error: dispatchError } = await supabase
    .from('dispatches')
    .insert({
      dispatch_type: 'single_box',
      guide_number: destination || '',
      notes: notes || '',
      dispatched_by: userId || null
    })
    .select('id')
    .single();

  if (dispatchError) return { error: dispatchError.message };

  if (dispatchRecord && seriesInBox && seriesInBox.length > 0) {
    const { logAudit } = await import('@/lib/database/audit');
    for (const s of seriesInBox) {
      await logAudit('series', s.id, 'DESPACHO CREADO', { dispatch_id: dispatchRecord.id, destination });
    }
  }

  // 6. Insert into dispatch_items
  if (dispatchRecord && seriesInBox && seriesInBox.length > 0) {
    const itemsToInsert = seriesInBox.map((s: any) => ({
      dispatch_id: dispatchRecord.id,
      series_id: s.id,
      box_id: boxId
    }));
    const { error: itemsError } = await supabase
      .from('dispatch_items')
      .insert(itemsToInsert);
      
    if (itemsError) console.error("Error inserting dispatch_items:", itemsError);
  }

  return { success: true };
}

export async function transferSpecificSeriesToArea(boxId: string, seriesNumbers: string[], targetArea: string, userId?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  // Map area to status
  let nextStatus = 'in_central_warehouse';
  if (targetArea === 'Bodega SCRAP' || targetArea === 'SCRAP') nextStatus = 'irreparable';
  if (targetArea === 'Bodega Obsoleto' || targetArea === 'Obsoleto') nextStatus = 'obsolete';
  if (targetArea === 'Diagnóstico') nextStatus = 'in_workshop';
  if (targetArea === 'Reparación') nextStatus = 'in_qc';
  if (targetArea === 'L3') nextStatus = 'in_control_warehouse';

  // 1. Update the series
  const { data: updatedSeries, error: seriesError } = await supabase
    .from('series')
    .update({ 
      current_status: nextStatus,
      current_box_id: null
    })
    .in('serial_number', seriesNumbers)
    .select('id');

  if (seriesError) return { error: seriesError.message };

  if (updatedSeries && updatedSeries.length > 0) {
    const { logAudit } = await import('@/lib/database/audit');
    for (const s of updatedSeries) {
      await logAudit('series', s.id, 'TRASLADO', { status: nextStatus, fromBox: boxId });
    }
  }

  // 2. Fetch remaining series count to check if box is empty
  const { count, error: countError } = await supabase
    .from('series')
    .select('*', { count: 'exact', head: true })
    .eq('current_box_id', boxId);

  if (!countError && count === 0) {
    // If the box is now empty, mark it as dispatched too or handle as needed
    await supabase.from('boxes').update({ rack_location: 'DESPACHO' }).eq('id', boxId);
  }

  return { success: true };
}

export async function dispatchSpecificSeries(boxId: string, seriesNumbers: string[], destination: string, notes?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  // 1. Get the current user
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  // 2. Fetch the series to get their IDs BEFORE updating
  const { data: targetSeries, error: fetchError } = await supabase
    .from('series')
    .select('id')
    .in('serial_number', seriesNumbers);

  if (fetchError) return { error: fetchError.message };

  // 3. Mark the selected series as dispatched and remove them from the box
  const { error: seriesError } = await supabase
    .from('series')
    .update({ 
      current_status: 'dispatched',
      current_box_id: null
    })
    .in('serial_number', seriesNumbers);

  if (seriesError) return { error: seriesError.message };

  // 4. Insert into dispatches
  const { data: dispatchRecord, error: dispatchError } = await supabase
    .from('dispatches')
    .insert({
      dispatch_type: 'individual',
      guide_number: destination || '',
      notes: notes || '',
      dispatched_by: userId || null
    })
    .select('id')
    .single();

  if (dispatchError) return { error: dispatchError.message };

  if (dispatchRecord && targetSeries && targetSeries.length > 0) {
    const { logAudit } = await import('@/lib/database/audit');
    for (const s of targetSeries) {
      await logAudit('series', s.id, 'DESPACHO CREADO', { dispatch_id: dispatchRecord.id, destination });
    }
  }

  // 5. Insert into dispatch_items
  if (dispatchRecord && targetSeries && targetSeries.length > 0) {
    const itemsToInsert = targetSeries.map((s: any) => ({
      dispatch_id: dispatchRecord.id,
      series_id: s.id,
      box_id: boxId
    }));
    const { error: itemsError } = await supabase
      .from('dispatch_items')
      .insert(itemsToInsert);
      
    if (itemsError) console.error("Error inserting dispatch_items:", itemsError);
  }

  // 6. Fetch remaining series count to check if box is empty
  const { count, error: countError } = await supabase
    .from('series')
    .select('*', { count: 'exact', head: true })
    .eq('current_box_id', boxId);

  if (countError) return { error: countError.message };

  // If the box is now empty, mark it as dispatched too
  if (count === 0) {
    const { error: boxError } = await supabase
      .from('boxes')
      .update({ rack_location: 'DESPACHO' })
      .eq('id', boxId);

    if (boxError) return { error: boxError.message };
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

  // 2. Solo series con estado de inventario en bodega (excluye taller, despacho, etc.)
  const { data, error } = await supabase
    .from("series")
    .select(`
      *,
      boxes (id, box_code, status, rack_location, created_at),
      service_orders (os_label),
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
    `)
    .in("current_box_id", warehouseBoxIds)
    .in("current_status", [...WAREHOUSE_INVENTORY_STATUSES])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching inventory details:", error);
    return { error: error.message };
  }

  const warehouseOnly = (data || []).filter((row: { current_status?: string; boxes?: { rack_location?: string } }) => {
    const rack = (row.boxes?.rack_location || '').toUpperCase();
    if (rack.startsWith('TALLER')) return false;
    return (WAREHOUSE_INVENTORY_STATUSES as readonly string[]).includes(row.current_status || '');
  });

  return { data: warehouseOnly };
}

