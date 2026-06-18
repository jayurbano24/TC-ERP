import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { logAdvancedAudit } from "@/lib/database/audit";

export type DbSeries = {
  id?: string;
  serial_number: string;
  brand_id?: string;
  model_id?: string;
  current_status: string;
  current_box_id?: string;
  current_reception_id?: string;
  updated_at?: string;
};

export async function getSeries(filters?: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  let query = supabase.from('series').select(`
    *,
    receptions (guide_number, carrier),
    boxes (box_code, rack_location)
  `);

  if (filters?.status) query = query.eq('current_status', filters.status);
  if (filters?.serial) query = query.ilike('serial_number', `%${filters.serial}%`);

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching series:", error);
    return [];
  }
  return data;
}

export async function searchSeriesDetailed(filters: { os?: string, imei?: string, cliente?: string, ticket?: string, tracking?: string, box?: string }) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  // Usamos left joins para traer todo
  let query = supabase.from('series').select(`
    *,
    receptions:current_reception_id (
      source,
      guide_number,
      sap_document,
      carrier,
      notes,
      processed_guides,
      reception_guides (guide_number, agency, category)
    ),
    boxes:current_box_id (box_code, rack_location),
    service_orders:service_order_id (os_label, os_number),
    brands:brand_id (name),
    models:model_id (name, technologies (name))
  `);

  if (filters.imei) {
    query = query.or(`serial_number.ilike.%${filters.imei}%,s2.ilike.%${filters.imei}%,s3.ilike.%${filters.imei}%,s4.ilike.%${filters.imei}%`);
  }

  // Obtenemos los resultados iniciales y filtramos en memoria por relaciones (dado que Supabase OR en joins internos es más complejo)
  const { data, error } = await query;
  if (error) {
    console.error("Error fetching detailed series:", error);
    return [];
  }

  let filtered = data || [];

  if (filters.os) {
    filtered = filtered.filter((s: any) => 
      s.service_orders?.os_label?.toLowerCase().includes(filters.os!.toLowerCase()) || 
      s.service_orders?.os_number?.toString().toLowerCase().includes(filters.os!.toLowerCase())
    );
  }
  if (filters.cliente) {
    filtered = filtered.filter((s: any) => 
      s.receptions?.carrier?.toLowerCase().includes(filters.cliente!.toLowerCase())
    );
  }
  if (filters.ticket) {
    filtered = filtered.filter((s: any) => 
      s.receptions?.sap_document?.toLowerCase().includes(filters.ticket!.toLowerCase())
    );
  }
  if (filters.tracking) {
    filtered = filtered.filter((s: any) => 
      s.receptions?.guide_number?.toLowerCase().includes(filters.tracking!.toLowerCase())
    );
  }
  if (filters.box) {
    filtered = filtered.filter((s: any) => 
      s.boxes?.box_code?.toLowerCase().includes(filters.box!.toLowerCase())
    );
  }

  return filtered;
}

export async function updateSeriesStatus(id: string, status: string, additionalData?: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { data, error } = await supabase
    .from('series')
    .update({ 
      current_status: status,
      ...additionalData,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select();

  if (error) return { error: error.message };

  await logAdvancedAudit({
    module: 'Trazabilidad',
    tableName: 'series',
    recordId: id,
    action: 'CAMBIO_ESTATUS',
    newValues: { status, ...additionalData },
    observations: `Estatus actualizado a: ${status}`
  });

  return { data };
}

export async function updateBulkSeriesStatus(ids: string[], status: string, additionalData?: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { error } = await supabase
    .from('series')
    .update({ 
      current_status: status,
      ...additionalData,
      updated_at: new Date().toISOString()
    })
    .in('id', ids);

  if (error) return { error: error.message };

  // Log para cada serie actualizada
  const auditPromises = ids.map(id => logAdvancedAudit({
    module: 'Trazabilidad',
    tableName: 'series',
    recordId: id,
    action: 'CAMBIO_ESTATUS',
    newValues: { status, ...additionalData },
    observations: `Estatus actualizado en lote a: ${status}`
  }));
  await Promise.allSettled(auditPromises);

  return { success: true };
}

