import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type DbReception = {
  id?: string;
  source: 'cac' | 'px';
  guide_number: string;
  sap_document?: string;
  carrier?: string;
  received_by?: string;
  reception_time?: string;
  expected_units?: number;
  received_units?: number;
  evidence_url?: string;
  notes?: string;
  status?: string;
  processed_guides?: string[];
  photo_urls?: string[];
  created_at?: string;
};

export async function getReceptions(source?: 'cac' | 'px') {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  try {
    let query = supabase
      .from('receptions')
      .select('*')
      .order('created_at', { ascending: false });

    if (source) {
      query = query.eq('source', source);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase query error:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("Network or Fetch error in getReceptions:", err);
    throw err; // Permite que el componente lo maneje
  }
}

export async function createReception(reception: DbReception) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { data, error } = await supabase
    .from('receptions')
    .insert([reception])
    .select()
    .single();

  if (error) {
    console.error("Error creating reception:", error);
    return { error: error.message };
  }

  return { data };
}

export async function updateReceptionStatus(id: string, status: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { error } = await supabase
    .from('receptions')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error("Error updating reception status:", error);
    return { error: error.message };
  }

  return { success: true };
}

export async function updateProcessedGuides(id: string, processedGuides: string[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { error } = await supabase
    .from('receptions')
    .update({ processed_guides: processedGuides })
    .eq('id', id);

  if (error) {
    console.error("Error updating processed guides:", error);
    return { error: error.message };
  }

  return { success: true };
}

export async function createReceptionWithSeries(reception: DbReception, series: string[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  // 1. Create the reception
  const { data: recData, error: recError } = await supabase
    .from('receptions')
    .insert([reception])
    .select()
    .single();

  if (recError) return { error: recError.message };

  // 2. Prepare series data
  const seriesToInsert = series.map(sn => ({
    serial_number: sn,
    current_reception_id: recData.id,
    current_status: 'INGRESADO'
  }));

  // 3. Insert series
  const { error: seriesError } = await supabase
    .from('series')
    .upsert(seriesToInsert, { onConflict: 'serial_number' });

  if (seriesError) return { error: seriesError.message };

  return { data: recData };
}

export async function createReceptionWithGuides(reception: DbReception, guides: string[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  // 1. Create the reception
  const { data: recData, error: recError } = await supabase
    .from('receptions')
    .insert([reception])
    .select()
    .single();

  if (recError) return { error: recError.message };

  // 2. Insert guides into reception_guides
  const guidesToInsert = guides.map(guide => ({
    reception_id: recData.id,
    guide_number: guide,
    status: 'PENDIENTE'
  }));

  if (guidesToInsert.length > 0) {
    const { error: guidesError } = await supabase
      .from('reception_guides')
      .upsert(guidesToInsert, { onConflict: 'reception_id,guide_number', ignoreDuplicates: true });

    // 3. Tolerancia a fallos: mostramos el error en consola pero NO bloqueamos ni revertimos
    // el retorno de la recepción maestra, ya que la recepción principal sí se creó con éxito.
    if (guidesError) {
      console.error("Warning: Falló la inserción en reception_guides:", guidesError.message);
    }
  }

  return { data: recData };
}

export async function addSeriesToReception(receptionId: string, series: string[], modelId?: string, brandId?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const seriesToInsert = series.map(sn => ({
    serial_number: sn,
    current_reception_id: receptionId,
    current_status: 'INGRESADO',
    ...(modelId ? { model_id: modelId } : {}),
    ...(brandId ? { brand_id: brandId } : {})
  }));

  const { error } = await supabase
    .from('series')
    .upsert(seriesToInsert, { onConflict: 'serial_number' });

  if (error) {
    console.error("Error inserting series:", error);
    return { error: error.message };
  }

  return { success: true };
}

export async function fixMissingOS(receptionId: string, unit: { main_serial: string, all_series: string[], model_id: string, brand_id: string }) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { count } = await supabase.from('service_orders').select('*', { count: 'exact', head: true }).eq('main_serial', unit.main_serial);
  const reentryCount = (count || 0) + 1;

  const { data: osData, error: osError } = await supabase.from('service_orders').insert([{
    reception_id: receptionId,
    model_id: unit.model_id,
    brand_id: unit.brand_id,
    main_serial: unit.main_serial,
    reentry_count: reentryCount,
    status: 'INGRESADO'
  }]).select().single();

  if (osError) return { error: osError.message };

  const seriesToUpsert = unit.all_series.map(sn => ({
    serial_number: sn,
    current_reception_id: receptionId,
    service_order_id: osData.id,
    current_status: 'RECEPCIONADO_BODEGA_GENERAL',
    model_id: unit.model_id,
    brand_id: unit.brand_id
  }));

  const { error: upsertError } = await supabase.from('series').upsert(seriesToUpsert, { onConflict: 'serial_number' });
  if (upsertError) return { error: upsertError.message };

  return { success: true };
}

export async function createServiceOrders(
  receptionId: string,
  units: { main_serial: string; model_id: string; brand_id: string; all_series: string[] }[],
  receptionGuideId?: string,
  sapTransferId?: string
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const results = [];
  
  for (const unit of units) {
    // 1. Verificar cuántas veces ha ingresado esta serie (re-entry)
    const { count, error: countError } = await supabase
      .from('service_orders')
      .select('*', { count: 'exact', head: true })
      .eq('main_serial', unit.main_serial);

    const reentryCount = (count || 0) + 1;

    // 2. Crear la Orden de Servicio (OS)
    const { data: osData, error: osError } = await supabase
      .from('service_orders')
      .insert([{
        reception_id: receptionId,
        reception_guide_id: receptionGuideId || null,
        sap_transfer_id: sapTransferId || null,
        model_id: unit.model_id,
        brand_id: unit.brand_id,
        main_serial: unit.main_serial,
        reentry_count: reentryCount,
        status: 'INGRESADO'
      }])
      .select()
      .single();

    if (osError) {
      console.error("Error creating Service Order:", osError);
      continue;
    }

    // 3. Vincular todas las series de esta unidad a la OS
    if (osData) {
      const seriesToUpsert = unit.all_series.map(sn => ({
        serial_number: sn,
        current_reception_id: receptionId,
        service_order_id: osData.id,
        sap_transfer_id: sapTransferId || null,
        current_status: 'RECEPCIONADO_BODEGA_GENERAL',
        model_id: unit.model_id,
        brand_id: unit.brand_id
      }));

      const { data: upsertedSeries } = await supabase.from('series').upsert(seriesToUpsert, { onConflict: 'serial_number' }).select('id');
      
      if (upsertedSeries) {
        const { logAudit } = await import('@/lib/database/audit');
        for (const s of upsertedSeries) {
          await logAudit('series', s.id, 'RECEPCIÓN CAC', { status: 'RECEPCIONADO_BODEGA_GENERAL', source: 'cac' });
        }
      }

      results.push(osData);
    }
  }

  return { data: results };
}

export async function getSeriesByReceptionId(receptionId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('series')
    .select('serial_number, model_id, brand_id, current_status')
    .eq('current_reception_id', receptionId);

  if (error) {
    console.error("Error fetching series:", error);
    return [];
  }

  return data || [];
}

export async function updateReception(id: string, updates: Partial<DbReception>) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { error } = await supabase
    .from('receptions')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error("Error updating reception:", error);
    return { error: error.message };
  }

  return { success: true };
}

export async function getReceptionsWithSeries(source?: 'cac' | 'px') {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  try {
    let query = supabase
      .from('receptions')
      .select('*, reception_guides(id, guide_number, category, agency, classified_at), sap_transfer_documents(id, reception_guide_id, sap_document_number, agency, status, created_at), series(id, serial_number, brand_id, model_id, current_status, current_box_id, sap_transfer_id, updated_at, service_orders(id, os_label, reentry_count, created_at, reception_guide_id, sap_transfer_id, reception_guides(guide_number, agency), sap_transfer_documents(sap_document_number, agency, status)))')
      .order('created_at', { ascending: false });

    if (source) {
      query = query.eq('source', source);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase query error:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("Error in getReceptionsWithSeries:", err);
    return [];
  }
}
export async function clearAllReceptions() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  // First clear series (cascade-like)
  const { error: seriesError } = await supabase.from('series').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (seriesError) console.error("Error clearing series:", seriesError);

  const { error } = await supabase.from('receptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) {
    console.error("Error clearing receptions:", error);
    return { error: error.message };
  }
  return { success: true };
}

export async function createPxReceptionWithBoxes(
  reception: DbReception,
  boxes: { id: string; box_code: string; expected_units: number; brand_id: string; model_id: string; material?: string; }[],
  seriesByBox: Record<string, string[]>
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  // 1. Create the reception
  const { data: recData, error: recError } = await supabase
    .from('receptions')
    .insert([reception])
    .select()
    .single();

  if (recError) return { error: recError.message };

  // Generate consecutive BOX-xxx codes
  const { data: lastBoxes } = await supabase
    .from('boxes')
    .select('box_code')
    .like('box_code', 'BOX-%');

  let maxBoxNum = 0;
  if (lastBoxes && lastBoxes.length > 0) {
    for (const row of lastBoxes) {
      const match = row.box_code.match(/^BOX-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxBoxNum) maxBoxNum = num;
      }
    }
  }

  const uiBoxToNewBox = new Map<string, string>();

  // 2. Prepare boxes data
  const boxesToInsert = boxes.map(b => {
    maxBoxNum++;
    const newBoxCode = `BOX-${maxBoxNum}`;
    uiBoxToNewBox.set(b.box_code, newBoxCode);

    return {
      reception_id: recData.id,
      box_code: newBoxCode,
      brand_id: b.brand_id,
      model_id: b.model_id,
      capacity: b.expected_units,
      status: 'closed',
      rack_location: 'BODEGA_CENTRAL' // Ingreso automático a Bodega Central al finalizar recepción PX
    };
  });

  const { data: createdBoxes, error: boxError } = await supabase
    .from('boxes')
    .insert(boxesToInsert)
    .select();

  if (boxError) {
    console.error("Error creating boxes:", boxError);
    return { error: boxError.message };
  }

  // 3. Crear series y OS por caja — cada equipo obtiene su propia OS con código único
  for (const b of boxes) {
    const newCode = uiBoxToNewBox.get(b.box_code);
    const createdBox = createdBoxes.find(cb => cb.box_code === newCode);
    if (!createdBox) continue;

    const equipments = seriesByBox[b.id] || [];
    if (equipments.length === 0) continue;

    // Batch fetch reentry counts
    const countPromises = equipments.map((eq: any) =>
      supabase.from('service_orders').select('*', { count: 'exact', head: true }).eq('main_serial', eq.sn)
    );
    const countResults = await Promise.all(countPromises);

    // Cada equipo = 1 OS. El campo os_label es autogenerado por PostgreSQL.
    const osToInsert = equipments.map((eq: any, i: number) => ({
      reception_id: recData.id,
      model_id: b.model_id,
      brand_id: b.brand_id,
      main_serial: eq.sn,
      reentry_count: (countResults[i]?.count || 0) + 1,
      status: 'INGRESADO'
    }));

    const { data: createdOs, error: osError } = await supabase
      .from('service_orders')
      .insert(osToInsert)
      .select();

    if (osError || !createdOs) {
      console.error(`Error creating OS for box ${b.box_code}:`, osError);
      continue;
    }

    // Vincular todas las series de cada equipo a su OS
    const seriesToUpsert: any[] = [];
    for (let i = 0; i < equipments.length; i++) {
      const eq: any = equipments[i];
      const os = createdOs.find(o => o.main_serial === eq.sn);
      if (!os) continue;

      const allSeries = [eq.sn, eq.s2, eq.s3, eq.s4].filter(Boolean);
      for (const sn of allSeries) {
        seriesToUpsert.push({
          serial_number: sn,
          brand_id: b.brand_id,
          model_id: b.model_id,
          material: b.material || eq.material,
          current_status: 'RECEPCIONADO_BODEGA_GENERAL',
          current_box_id: createdBox.id,
          current_reception_id: recData.id,
          service_order_id: os.id
        });
      }
    }

    if (seriesToUpsert.length > 0) {
      const { data: upsertedSeries, error: seriesError } = await supabase
        .from('series')
        .upsert(seriesToUpsert, { onConflict: 'serial_number' })
        .select('id, serial_number');

      if (seriesError) {
        console.error(`Error upserting series para caja ${b.box_code}:`, seriesError);
        continue;
      }
      
      if (upsertedSeries) {
        const { logAudit } = await import('@/lib/database/audit');
        for (const s of upsertedSeries) {
          await logAudit('series', s.id, 'RECEPCIÓN PX', { status: 'RECEPCIONADO_BODEGA_GENERAL', source: 'px', box: b.box_code });
        }
      }
    }
  }

  return { data: recData };
}
