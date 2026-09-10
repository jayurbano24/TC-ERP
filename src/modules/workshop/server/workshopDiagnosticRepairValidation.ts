import type { SupabaseClient } from '@supabase/supabase-js';
import { BusinessException } from '@/shared/errors/Exceptions';
import { CAT_DIAGNOSTIC_REPAIR_SELECT } from '@/shared/constants/dbProjections';
import {
  validateRepairsAgainstDiagnostics,
  type WorkshopDiagnosticCatalogEntry,
  type WorkshopRepairCatalogEntry,
} from '@/modules/workshop/shared/workshopDiagnosticRepairPolicy';

async function loadWorkshopDiagnosticRepairCatalog(
  supabase: SupabaseClient,
): Promise<{
  diagnostics: WorkshopDiagnosticCatalogEntry[];
  repairs: WorkshopRepairCatalogEntry[];
}> {
  const [diagnosticsRes, repairsRes, relRes] = await Promise.all([
    supabase.from('cat_diagnostics').select('id, name').order('name'),
    supabase.from('cat_repairs').select('id, name').order('name'),
    supabase.from('cat_diagnostic_repairs').select(CAT_DIAGNOSTIC_REPAIR_SELECT),
  ]);

  if (diagnosticsRes.error) throw new Error(diagnosticsRes.error.message);
  if (repairsRes.error) throw new Error(repairsRes.error.message);
  if (relRes.error) throw new Error(relRes.error.message);

  const relData = relRes.data ?? [];
  const diagnostics = (diagnosticsRes.data ?? []).map((d) => {
    const rels = relData.filter(
      (r: { diagnostic_id: string }) => String(r.diagnostic_id) === String(d.id),
    );
    return {
      id: String(d.id),
      nombre: String(d.name || ''),
      reparacionesIds: rels.map((r: { repair_id: string }) => String(r.repair_id)),
    };
  });

  const repairs = (repairsRes.data ?? []).map((r) => ({
    id: String(r.id),
    nombre: String(r.name || ''),
  }));

  return { diagnostics, repairs };
}

/** Valida reparaciones vs diagnóstico persistido en series (por OS). */
export async function assertWorkshopRepairsMatchDiagnostics(
  supabase: SupabaseClient,
  seriesIds: string[],
  selectedRepairIds: string[],
  actionName: string,
): Promise<void> {
  const isRepairStage =
    actionName === 'REPARACIÓN COMPLETADA' || actionName === 'REPARACIÓN L3 COMPLETADA';
  const isQcRepairCorrection =
    actionName === 'CONTROL DE CALIDAD COMPLETADO' && selectedRepairIds.length > 0;

  if (!isRepairStage && !isQcRepairCorrection) {
    return;
  }

  const repairs = [...new Set(selectedRepairIds.map(String).filter(Boolean))];
  if (repairs.length === 0) {
    if (isRepairStage) {
      throw new BusinessException('Seleccione al menos una reparación del catálogo.');
    }
    return;
  }

  const { data: seriesRows, error } = await supabase
    .from('series')
    .select('id, service_order_id, current_diagnostics')
    .in('id', seriesIds);

  if (error) throw new Error(error.message);

  const diagnosticsByOs = new Map<string, Set<string>>();
  for (const row of seriesRows || []) {
    const osId = row.service_order_id ? String(row.service_order_id) : `orphan:${row.id}`;
    const set = diagnosticsByOs.get(osId) ?? new Set<string>();
    for (const diagId of (row.current_diagnostics as string[] | null) ?? []) {
      const normalized = String(diagId || '').trim();
      if (normalized) set.add(normalized);
    }
    diagnosticsByOs.set(osId, set);
  }

  const { diagnostics: catalog, repairs: repairsCatalog } =
    await loadWorkshopDiagnosticRepairCatalog(supabase);

  for (const [osKey, diagSet] of diagnosticsByOs) {
    const diagnosticIds = [...diagSet];
    const check = validateRepairsAgainstDiagnostics(
      diagnosticIds,
      repairs,
      catalog,
      repairsCatalog,
    );
    if (!check.ok) {
      const prefix = osKey.startsWith('orphan:') ? 'Equipo' : 'OS';
      throw new BusinessException(`${prefix}: ${check.message}`);
    }
  }
}
