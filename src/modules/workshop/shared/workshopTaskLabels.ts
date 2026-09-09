import {
  resolveWorkshopCatalogName,
  type WorkshopCatalogEntry,
} from '@/modules/workshop/shared/workshopHistoryDisplay';

export type WorkshopReacondicionadoEntry = { id: string; name?: string | null };

export type WorkshopTaskCatalogRow = {
  current_diagnostics?: string[];
  current_repairs?: string[];
  current_reacondicionado?: string[];
  l3_reason_text?: string | null;
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
  sources: Pick<WorkshopTaskLabelSources, 'diagnostics' | 'catalogNamesById'>,
): string {
  const diagIds = Array.isArray(row.current_diagnostics)
    ? row.current_diagnostics.map(String).filter(Boolean)
    : [];
  if (diagIds.length > 0) {
    return joinCatalogLabels(
      resolveCatalogNames(diagIds, sources.diagnostics, [], sources.catalogNamesById),
      'Sin diagnóstico registrado',
    );
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
    return String(hit?.name || '').trim() || id;
  });

  return joinCatalogLabels(names, 'Sin reacondicionado registrado');
}

export function enrichWorkshopTaskDisplayLabels(
  row: WorkshopTaskCatalogRow,
  sources: WorkshopTaskLabelSources,
): {
  diagnosticoLabel: string;
  reparacionLabel: string;
  reacondicionadoLabel: string;
} {
  return {
    diagnosticoLabel: resolveWorkshopDiagnosticLabel(row, sources),
    reparacionLabel: resolveWorkshopRepairLabel(row, sources),
    reacondicionadoLabel: resolveWorkshopReacondicionadoLabel(row, sources),
  };
}
