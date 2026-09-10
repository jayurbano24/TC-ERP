import {
  isWorkshopUuidLike,
  resolveWorkshopCatalogName,
  type WorkshopCatalogEntry,
} from '@/modules/workshop/shared/workshopHistoryDisplay';

export type WorkshopReacondicionadoEntry = { id: string; name?: string | null };

export type WorkshopTaskCatalogRow = {
  current_diagnostics?: string[];
  current_repairs?: string[];
  current_reacondicionado?: string[];
  l3_reason_text?: string | null;
  diagnostic_detail_text?: string | null;
  scrap_origin_stage?: string | null;
  scrap_reason_text?: string | null;
};

export type WorkshopTaskLabelSources = {
  diagnostics: WorkshopCatalogEntry[];
  repairs: WorkshopCatalogEntry[];
  reacondicionadoTests: WorkshopReacondicionadoEntry[];
  catalogNamesById?: Record<string, string>;
};

function joinCatalogLabels(names: string[], emptyLabel: string): string {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  return unique.length > 0 ? unique.join(' · ') : emptyLabel;
}

function resolveCatalogNames(
  ids: string[],
  diagnostics: WorkshopCatalogEntry[],
  repairs: WorkshopCatalogEntry[],
  catalogNamesById?: Record<string, string>,
): string[] {
  return ids
    .map((id) => resolveWorkshopCatalogName(id, diagnostics, repairs, catalogNamesById))
    .filter(Boolean);
}

export function resolveWorkshopDiagnosticLabel(
  row: WorkshopTaskCatalogRow,
  sources: Pick<WorkshopTaskLabelSources, 'diagnostics' | 'repairs' | 'catalogNamesById'>,
): string {
  const diagIds = Array.isArray(row.current_diagnostics)
    ? row.current_diagnostics.map(String).filter(Boolean)
    : [];
  if (diagIds.length > 0) {
    const names = resolveCatalogNames(
      diagIds,
      sources.diagnostics,
      sources.repairs ?? [],
      sources.catalogNamesById,
    );
    if (names.length > 0) {
      return joinCatalogLabels(names, 'Sin diagnóstico registrado');
    }
    return 'Diagnóstico no catalogado';
  }
  const reason = String(row.l3_reason_text || '').trim();
  if (reason) return reason;
  return 'Sin diagnóstico registrado';
}

export function resolveWorkshopRepairLabel(
  row: WorkshopTaskCatalogRow,
  sources: Pick<WorkshopTaskLabelSources, 'repairs' | 'catalogNamesById'>,
): string {
  const repairIds = Array.isArray(row.current_repairs)
    ? row.current_repairs.map(String).filter(Boolean)
    : [];
  return joinCatalogLabels(
    resolveCatalogNames(repairIds, [], sources.repairs, sources.catalogNamesById),
    'Sin reparación registrada',
  );
}

export function resolveWorkshopReacondicionadoLabel(
  row: WorkshopTaskCatalogRow,
  sources: Pick<WorkshopTaskLabelSources, 'reacondicionadoTests' | 'catalogNamesById'>,
): string {
  const testIds = Array.isArray(row.current_reacondicionado)
    ? row.current_reacondicionado.map(String).filter(Boolean)
    : [];
  if (testIds.length === 0) return 'Sin reacondicionado registrado';

  const names = testIds.map((id) => {
    const fromLookup = sources.catalogNamesById?.[id];
    if (fromLookup) return fromLookup;
    const hit = sources.reacondicionadoTests.find((t) => t.id === id);
    const name = String(hit?.name || '').trim();
    if (name) return name;
    return isWorkshopUuidLike(id) ? '' : id;
  });

  return joinCatalogLabels(names, 'Sin reacondicionado registrado');
}

export function formatWorkshopScrapOriginStage(action: string): string {
  const normalized = String(action || '').trim().toUpperCase();
  if (normalized.includes('DIAGNÓSTICO')) return 'Diagnóstico';
  if (normalized.includes('REPARACIÓN L3') || normalized.includes('REPARACION L3')) return 'L3';
  if (normalized.includes('REPARACIÓN') || normalized.includes('REPARACION')) return 'Reparación';
  if (normalized.includes('REACONDICIONADO')) return 'Reacondicionado';
  if (normalized.includes('CONTROL DE CALIDAD')) return 'Control de Calidad';
  return 'Taller';
}

export function resolveWorkshopDiagnosticDetailLabel(
  row: WorkshopTaskCatalogRow,
  sources: Pick<WorkshopTaskLabelSources, 'diagnostics' | 'repairs' | 'catalogNamesById'>,
): string {
  const catalog = resolveWorkshopDiagnosticLabel(row, sources);
  const detail = String(row.diagnostic_detail_text || '').trim();
  const hasCatalog =
    catalog !== 'Sin diagnóstico registrado' && catalog !== 'Diagnóstico no catalogado';

  if (hasCatalog && detail) return `${catalog} · ${detail}`;
  if (detail) return detail;
  if (hasCatalog) return catalog;
  const l3Reason = String(row.l3_reason_text || '').trim();
  if (l3Reason) return l3Reason;
  return 'Sin detalle registrado';
}

export function resolveWorkshopScrapReasonLabel(row: WorkshopTaskCatalogRow): string {
  const stage = String(row.scrap_origin_stage || '').trim();
  const reason = String(row.scrap_reason_text || '').trim();
  if (stage && reason) return `Desde ${stage}: ${reason}`;
  if (reason) return reason;
  if (stage) return `Marcado en ${stage}`;
  return 'Sin razón registrada';
}

export function enrichWorkshopTaskDisplayLabels(
  row: WorkshopTaskCatalogRow,
  sources: WorkshopTaskLabelSources,
): {
  diagnosticoLabel: string;
  diagnosticoDetalleLabel: string;
  reparacionLabel: string;
  reacondicionadoLabel: string;
  scrapReasonLabel: string;
} {
  return {
    diagnosticoLabel: resolveWorkshopDiagnosticLabel(row, sources),
    diagnosticoDetalleLabel: resolveWorkshopDiagnosticDetailLabel(row, sources),
    reparacionLabel: resolveWorkshopRepairLabel(row, sources),
    reacondicionadoLabel: resolveWorkshopReacondicionadoLabel(row, sources),
    scrapReasonLabel: resolveWorkshopScrapReasonLabel(row),
  };
}
