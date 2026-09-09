export type WorkshopCatalogEntry = { id: string; nombre: string };

export function formatWorkshopResultLabel(result: unknown): string {
  const r = String(result || '');
  if (r === 'reparacion') return 'Reparación (L1/L2)';
  if (r === 'reacondicionado') return 'Reacondicionado';
  if (r === 'l3') return 'Falla Mayor (L3)';
  if (r === 'scraps') return 'Scrap / Desecho';
  if (r === 'control_calidad') return 'Control de Calidad QC';
  if (r === 'listo') return 'Aceptado / Listo';
  if (r === 'rechazado_qc') return 'Rechazado en QC';
  return r;
}

export function collectWorkshopCatalogIds(payload: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const key of ['diagnostics', 'repairs', 'items'] as const) {
    const arr = payload[key];
    if (Array.isArray(arr)) {
      for (const entry of arr) {
        const id = String(entry || '').trim();
        if (id) ids.push(id);
      }
    }
  }
  return [...new Set(ids)];
}

export function resolveWorkshopCatalogName(
  id: string,
  diagnostics: WorkshopCatalogEntry[],
  repairs: WorkshopCatalogEntry[],
  nameLookup?: Record<string, string>,
): string {
  const fromLookup = nameLookup?.[id];
  if (fromLookup) return fromLookup;

  const diag = diagnostics.find((d) => d.id === id);
  if (diag?.nombre) return diag.nombre;
  const rep = repairs.find((r) => r.id === id);
  if (rep?.nombre) return rep.nombre;
  return id;
}

export function workshopCatalogListTitle(action: string): string {
  if (action.includes('REPARACIÓN')) return 'Reparaciones realizadas';
  if (action.includes('REACONDICIONADO')) return 'Pruebas realizadas';
  if (action.includes('DIAGNÓSTICO')) return 'Fallas / ítems reportados';
  return 'Ítems registrados';
}

export function formatWorkshopNextStatusLabel(status: unknown): string {
  const s = String(status || '');
  if (s === 'in_workshop') return 'DIAGNÓSTICO';
  if (s === 'in_qc') return 'REPARACIÓN';
  if (s === 'in_validation') return 'CONTROL DE CALIDAD';
  if (s === 'in_control_warehouse') return 'L3';
  if (s === 'ready_to_dispatch') return 'REACONDICIONADO';
  if (s === 'scrapped' || s === 'irreparable') return 'SCRAPS';
  if (s === 'in_central_warehouse') return 'EQUIPO LISTO / BODEGA';
  if (s === 'RECEPCIONADO_BODEGA_GENERAL') return 'BACKOFFICE';
  return s.replace(/_/g, ' ').toUpperCase();
}

export type ParsedWorkshopEvaluationNotes = {
  sectionLabel: string | null;
  bodyLines: string[];
  additionalNotes: string | null;
};

/** Separa el bloque `[Evaluación Taller - …]` y las notas adicionales del resto. */
export function parseWorkshopEvaluationNotes(notes: string): ParsedWorkshopEvaluationNotes {
  const raw = String(notes || '').trim();
  if (!raw) {
    return { sectionLabel: null, bodyLines: [], additionalNotes: null };
  }

  const additionalMatch = raw.match(/\n?\s*Notas adicionales:\s*(.*)$/is);
  const withoutAdditional = additionalMatch
    ? raw.slice(0, additionalMatch.index).trim()
    : raw;
  const additionalNotes = additionalMatch?.[1]?.trim() || null;

  const lines = withoutAdditional.split('\n').map((l) => l.trim()).filter(Boolean);
  let sectionLabel: string | null = null;
  const bodyLines: string[] = [];

  for (const line of lines) {
    const section = line.match(/^\[Evaluación Taller - (.+)\]$/i);
    if (section) {
      sectionLabel = section[1]?.trim().toUpperCase() || null;
      continue;
    }
    bodyLines.push(line);
  }

  return { sectionLabel, bodyLines, additionalNotes };
}
