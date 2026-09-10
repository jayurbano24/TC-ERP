export type WorkshopDiagnosticCatalogEntry = {
  id: string;
  nombre?: string | null;
  reparacionesIds?: string[];
  /** Vacío = aplica a todas las tecnologías. */
  technologyIds?: string[];
};

export type WorkshopRepairCatalogEntry = {
  id: string;
  nombre?: string | null;
};

export type WorkshopRepairValidationResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      invalidRepairIds?: string[];
    };

/** Reparaciones permitidas = unión de `reparacionesIds` de los diagnósticos del equipo. */
/** Diagnóstico sin tecnologías = aplica a todas; con lista = solo esas tecnologías. */
export function diagnosticAppliesToTechnology(
  diagnostic: WorkshopDiagnosticCatalogEntry,
  technologyId: string | null | undefined,
): boolean {
  const scoped = (diagnostic.technologyIds || []).map(String).filter(Boolean);
  if (scoped.length === 0) return true;
  if (!technologyId) return true;
  return scoped.includes(String(technologyId));
}

export function filterDiagnosticsForTechnology(
  diagnostics: WorkshopDiagnosticCatalogEntry[],
  technologyId: string | null | undefined,
): WorkshopDiagnosticCatalogEntry[] {
  return diagnostics.filter((d) => diagnosticAppliesToTechnology(d, technologyId));
}

export function resolveAllowedRepairIdsForDiagnostics(
  diagnosticIds: string[],
  diagnosticsCatalog: WorkshopDiagnosticCatalogEntry[],
): Set<string> {
  const ids = new Set(diagnosticIds.map(String).filter(Boolean));
  if (ids.size === 0) return new Set();

  const allowed = new Set<string>();
  for (const diag of diagnosticsCatalog) {
    if (!ids.has(String(diag.id))) continue;
    for (const repairId of diag.reparacionesIds || []) {
      const normalized = String(repairId || '').trim();
      if (normalized) allowed.add(normalized);
    }
  }
  return allowed;
}

export function repairCatalogName(
  repairId: string,
  repairsCatalog: WorkshopRepairCatalogEntry[],
): string {
  const hit = repairsCatalog.find((r) => String(r.id) === String(repairId));
  return String(hit?.nombre || repairId).trim() || repairId;
}

export function diagnosticCatalogNames(
  diagnosticIds: string[],
  diagnosticsCatalog: WorkshopDiagnosticCatalogEntry[],
): string[] {
  return diagnosticIds
    .map((id) => diagnosticsCatalog.find((d) => String(d.id) === String(id))?.nombre || id)
    .filter(Boolean);
}

/** Valida que cada reparación seleccionada esté mapeada a algún diagnóstico del equipo. */
export function validateRepairsAgainstDiagnostics(
  diagnosticIds: string[],
  repairIds: string[],
  diagnosticsCatalog: WorkshopDiagnosticCatalogEntry[],
  repairsCatalog: WorkshopRepairCatalogEntry[] = [],
): WorkshopRepairValidationResult {
  const diags = [...new Set(diagnosticIds.map(String).filter(Boolean))];
  const repairs = [...new Set(repairIds.map(String).filter(Boolean))];

  if (repairs.length === 0) {
    return { ok: false, message: 'Seleccione al menos una reparación del catálogo.' };
  }

  if (diags.length === 0) {
    return {
      ok: false,
      message:
        'El equipo no tiene diagnóstico inicial registrado. Complete diagnóstico antes de reparar.',
    };
  }

  const allowed = resolveAllowedRepairIdsForDiagnostics(diags, diagnosticsCatalog);

  if (allowed.size === 0) {
    const diagLabels = diagnosticCatalogNames(diags, diagnosticsCatalog).join(' · ');
    return {
      ok: false,
      message: `No hay reparaciones configuradas para el diagnóstico (${diagLabels}). Revise Configuración → Catálogo Taller.`,
    };
  }

  const invalid = repairs.filter((id) => !allowed.has(id));
  if (invalid.length === 0) return { ok: true };

  const invalidNames = invalid.map((id) => repairCatalogName(id, repairsCatalog));
  const diagLabels = diagnosticCatalogNames(diags, diagnosticsCatalog).join(' · ');

  return {
    ok: false,
    message: `Reparación no permitida para el diagnóstico (${diagLabels}): ${invalidNames.join(', ')}.`,
    invalidRepairIds: invalid,
  };
}

/** Intersección de reparaciones válidas para varios equipos (operación masiva). */
export function intersectAllowedRepairIdsAcrossEquipments(
  diagnosticIdsPerEquipment: string[][],
  diagnosticsCatalog: WorkshopDiagnosticCatalogEntry[],
): Set<string> {
  let intersection: Set<string> | null = null;

  for (const diagIds of diagnosticIdsPerEquipment) {
    const allowed = resolveAllowedRepairIdsForDiagnostics(diagIds, diagnosticsCatalog);
    if (intersection === null) {
      intersection = allowed;
      continue;
    }
    intersection = new Set([...intersection].filter((id) => allowed.has(id)));
  }

  return intersection ?? new Set();
}
