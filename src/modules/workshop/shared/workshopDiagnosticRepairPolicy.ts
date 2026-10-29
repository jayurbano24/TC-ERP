/** Destinos de evaluación inicial (Diagnóstico → siguiente etapa). */
export const WORKSHOP_DIAGNOSTIC_OUTCOMES = [
  'reacondicionado',
  'reparacion',
  'l3',
] as const;

export type WorkshopDiagnosticOutcome = (typeof WORKSHOP_DIAGNOSTIC_OUTCOMES)[number];

export const WORKSHOP_DIAGNOSTIC_OUTCOME_LABELS: Record<WorkshopDiagnosticOutcome, string> = {
  reacondicionado: 'Reacondicionado',
  reparacion: 'Reparación L1/L2',
  l3: 'Nivel 3',
};

export type WorkshopDiagnosticCatalogEntry = {
  id: string;
  nombre?: string | null;
  reparacionesIds?: string[];
  /** Vacío = aplica a todas las tecnologías. */
  technologyIds?: string[];
  /**
   * Destinos permitidos al completar Diagnóstico.
   * Vacío/ausente = Reparación L1/L2 + Nivel 3 (nunca Reacondicionado por defecto).
   */
  allowedOutcomes?: WorkshopDiagnosticOutcome[];
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

/** Default seguro: sin Reacondicionado salvo configuración explícita. */
const DEFAULT_DIAGNOSTIC_OUTCOMES: WorkshopDiagnosticOutcome[] = [
  'reparacion',
  'l3',
];

function normalizeDiagnosticOutcomes(
  raw: unknown,
): WorkshopDiagnosticOutcome[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_DIAGNOSTIC_OUTCOMES];
  }
  const allowed = new Set<string>(WORKSHOP_DIAGNOSTIC_OUTCOMES);
  const out = [
    ...new Set(
      raw
        .map((v) => String(v || '').trim())
        .filter((v): v is WorkshopDiagnosticOutcome => allowed.has(v)),
    ),
  ];
  return out.length > 0 ? out : [...DEFAULT_DIAGNOSTIC_OUTCOMES];
}

type DiagnosticOutcomesSource = WorkshopDiagnosticCatalogEntry & {
  allowed_outcomes?: unknown;
};

function readDiagnosticAllowedOutcomes(
  diagnostic: WorkshopDiagnosticCatalogEntry | undefined,
): unknown {
  if (!diagnostic) return undefined;
  const row = diagnostic as DiagnosticOutcomesSource;
  return row.allowedOutcomes ?? row.allowed_outcomes;
}

/** Destinos permitidos por un diagnóstico del catálogo. */
export function resolveOutcomesForDiagnostic(
  diagnostic: WorkshopDiagnosticCatalogEntry | undefined,
): Set<WorkshopDiagnosticOutcome> {
  return new Set(normalizeDiagnosticOutcomes(readDiagnosticAllowedOutcomes(diagnostic)));
}

function isReacondicionadoOnly(allowed: Set<WorkshopDiagnosticOutcome>): boolean {
  return allowed.size === 1 && allowed.has('reacondicionado');
}

function intersectOutcomeSets(
  sets: Array<Set<WorkshopDiagnosticOutcome>>,
): Set<WorkshopDiagnosticOutcome> {
  if (sets.length === 0) return new Set();
  let intersection: Set<WorkshopDiagnosticOutcome> | null = null;
  for (const allowed of sets) {
    if (intersection === null) {
      intersection = new Set(allowed);
      continue;
    }
    intersection = new Set([...intersection].filter((o) => allowed.has(o)));
  }
  return intersection ?? new Set();
}

/**
 * Destinos permitidos por los diagnósticos seleccionados.
 *
 * - Solo fallas “reacondicionado-only” → Reacondicionado.
 * - Si se agrega alguna falla con Reparación L1/L2 o L3, prevalecen esos destinos
 *   (se ignoran las fallas solo-reacondicionado al calcular la intersección).
 * - Si no hay diagnósticos, el conjunto queda vacío.
 */
export function resolveAllowedOutcomesForDiagnostics(
  diagnosticIds: string[],
  diagnosticsCatalog: WorkshopDiagnosticCatalogEntry[],
): Set<WorkshopDiagnosticOutcome> {
  const ids = [...new Set(diagnosticIds.map(String).filter(Boolean))];
  if (ids.length === 0) return new Set();

  const perDiag = ids.map((id) => {
    const diag = diagnosticsCatalog.find((d) => String(d.id) === id);
    return resolveOutcomesForDiagnostic(diag);
  });

  const repairSets = perDiag.filter((allowed) => !isReacondicionadoOnly(allowed));
  if (repairSets.length > 0) {
    const intersection = intersectOutcomeSets(repairSets);
    intersection.delete('reacondicionado');
    return intersection;
  }

  return intersectOutcomeSets(perDiag);
}

export type WorkshopOutcomeValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/** Valida que el resultado de Diagnóstico esté permitido por los diagnósticos elegidos. */
export function validateDiagnosticOutcome(
  diagnosticIds: string[],
  result: string,
  diagnosticsCatalog: WorkshopDiagnosticCatalogEntry[],
): WorkshopOutcomeValidationResult {
  const outcome = String(result || '').trim();
  if (!(WORKSHOP_DIAGNOSTIC_OUTCOMES as readonly string[]).includes(outcome)) {
    return { ok: true };
  }

  const diags = [...new Set(diagnosticIds.map(String).filter(Boolean))];
  if (diags.length === 0) {
    return { ok: false, message: 'Seleccione al menos un diagnóstico del catálogo.' };
  }

  const allowed = resolveAllowedOutcomesForDiagnostics(diags, diagnosticsCatalog);
  if (allowed.has(outcome as WorkshopDiagnosticOutcome)) return { ok: true };

  const label =
    WORKSHOP_DIAGNOSTIC_OUTCOME_LABELS[outcome as WorkshopDiagnosticOutcome] || outcome;
  const diagLabels = diagnosticCatalogNames(diags, diagnosticsCatalog).join(' · ');
  const allowedLabels = [...allowed]
    .map((o) => WORKSHOP_DIAGNOSTIC_OUTCOME_LABELS[o])
    .join(' · ');

  return {
    ok: false,
    message: allowedLabels
      ? `"${label}" no aplica al diagnóstico (${diagLabels}). Destinos permitidos: ${allowedLabels}. Revise Configuración → Diagnósticos.`
      : `"${label}" no aplica al diagnóstico (${diagLabels}). Ningún destino común configurado. Revise Configuración → Diagnósticos.`,
  };
}
