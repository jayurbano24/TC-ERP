import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/database/audit";

export async function getWorkshopTasks(stage?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  let query = supabase
    .from('series')
    .select(`
      id,
      serial_number,
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
      boxes ( box_code ),
      ingress_count,
      current_diagnostics
    `)
    .in('current_status', ['in_workshop', 'in_qc', 'in_validation', 'in_control_warehouse', 'ready_to_dispatch', 'irreparable', 'in_central_warehouse']);

  if (stage) {
    // Stage logic could be linked to status
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching workshop tasks:", error.message || error);
    return [];
  }
  return data || [];
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
