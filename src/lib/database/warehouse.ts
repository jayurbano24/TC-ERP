import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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

export async function createBoxWithSeries(boxData: any, seriesNumbers: string[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  // 0. Fallback for reception_id if missing (to prevent not-null constraint errors)
  if (!boxData.reception_id) {
    const { data: recData } = await supabase.from('receptions').select('id').limit(1).single();
    if (recData) {
      boxData.reception_id = recData.id;
    }
  }

  // 1. Create the box
  const { data: box, error: boxError } = await supabase
    .from('boxes')
    .insert([boxData])
    .select()
    .single();

  if (boxError) return { error: boxError.message };

  // 2. Link series to this box and update their status
  const { error: seriesError } = await supabase
    .from('series')
    .update({ 
      current_box_id: box.id,
      current_status: 'in_central_warehouse'
    })
    .in('serial_number', seriesNumbers);

  if (seriesError) return { error: seriesError.message };

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

  // Map area to status
  let nextStatus = 'in_central_warehouse';
  if (targetArea === 'Bodega SCRAP' || targetArea === 'SCRAP') nextStatus = 'irreparable';
  if (targetArea === 'Bodega Obsoleto' || targetArea === 'Obsoleto') nextStatus = 'obsolete';
  if (targetArea === 'Diagnóstico') nextStatus = 'in_workshop';

  // 1. Update boxes location
  if (targetRack !== undefined) {
    const { error: boxError } = await supabase
      .from('boxes')
      .update({ 
        rack_location: targetRack
      })
      .in('id', boxIds);

    if (boxError) return { error: boxError.message };
  }

  // 2. Update all series inside these boxes
  const { data: updatedSeries, error: seriesError } = await supabase
    .from('series')
    .update({ current_status: nextStatus })
    .in('current_box_id', boxIds)
    .select('id');

  if (seriesError) return { error: seriesError.message };
  
  if (updatedSeries && nextStatus === 'in_central_warehouse') {
    const { logAudit } = await import('@/lib/database/audit');
    for (const s of updatedSeries) {
      await logAudit('series', s.id, 'INGRESO BODEGA', { status: 'in_central_warehouse', boxIds });
    }
  }

  return { success: true };
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

  // 1. Get all boxes currently in the warehouse (not dispatched)
  const { data: warehouseBoxes, error: boxError } = await supabase
    .from("boxes")
    .select("id")
    .not("rack_location", "in", '("DESPACHO","ELIMINADO")');

  if (boxError) {
    console.error("Error fetching closed boxes:", boxError);
    return { error: boxError.message };
  }

  if (!warehouseBoxes || warehouseBoxes.length === 0) {
    return { data: [] };
  }

  const warehouseBoxIds = warehouseBoxes.map((b: any) => b.id);

  // 2. Fetch only series that belong to those closed boxes
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
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching inventory details:", error);
    return { error: error.message };
  }

  return { data };
}

