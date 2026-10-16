import type { Verdict } from '@/modules/backoffice/prediagnostico/validatePrediagnostico';

/** Etiquetas SCA / UI (sustantivo: Reparación, no Reparado). Valores en BD siguen siendo reparado | reacondicionado | irreparable. */
export const PREDIAGNOSTICO_DICTAMEN_LABELS: Record<Verdict, string> = {
  reacondicionado: 'Reacondición',
  reparado: 'Reparación',
  irreparable: 'Irreparable',
};

export function labelPrediagnosticoDictamen(dictamen: string): string {
  const key = dictamen.trim().toLowerCase();
  if (key === 'reacondicionado' || key === 'reparado' || key === 'irreparable') {
    return PREDIAGNOSTICO_DICTAMEN_LABELS[key];
  }
  return dictamen.trim();
}
