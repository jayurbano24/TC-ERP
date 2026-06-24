import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/database/audit";

const TALLER_WORKSHOP_AUDIT_ACTIONS = new Set([
  'INGRESO A TALLER',
  'DIAGNÓSTICO INICIAL COMPLETADO',
  'REPARACIÓN COMPLETADA',
  'CONTROL DE CALIDAD COMPLETADO',
  'REACONDICIONADO COMPLETADO',
]);

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
      boxes ( box_code, rack_location ),
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

  const rows = data || [];
  const centralWarehouseIds = rows
    .filter((row) => row.current_status === 'in_central_warehouse')
    .map((row) => row.id as string);

  let workshopAuditIds = new Set<string>();
  if (centralWarehouseIds.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < centralWarehouseIds.length; i += chunkSize) {
      const chunk = centralWarehouseIds.slice(i, i + chunkSize);
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
  }

  return rows.filter((row) => {
    const hasWorkshopAudit = workshopAuditIds.has(row.id as string);
    return !isWarehouseStockOnlyInCentral({
      current_status: row.current_status,
      ingress_count: row.ingress_count,
      boxes: row.boxes as { rack_location?: string | null } | null,
      has_workshop_audit: hasWorkshopAudit,
    });
  });
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
