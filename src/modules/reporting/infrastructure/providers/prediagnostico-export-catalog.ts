import type { PrediagnosticoCheckItem } from './prediagnostico-report-format';

export const PREDIAGNOSTICO_CLASE_COLUMN = 'Clase';

/** Columnas fijas del contrato SCA (sin ítems del catálogo). */
export const PREDIAGNOSTICO_BASE_EXPORT_COLUMNS = [
  'N.º',
  'Número de ingreso al SCA',
  'Procedencia',
  'Agencia, Central o Aliado de recuperación',
  'Marca',
  'Modelo',
  'SKU',
  'Número de traslado SAP',
  'Serie',
  'MAC',
  'S1',
  'S2',
  'S3',
  'S4',
  'Tecnología',
  'Vigencia',
  'Fecha de ingreso',
  'Dictamen',
] as const;

function sortCatalogItems(items: PrediagnosticoCheckItem[]): PrediagnosticoCheckItem[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'));
}

/** Nombres de columna únicos (como en configuración). */
export function catalogItemColumnLabels(items: PrediagnosticoCheckItem[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const item of sortCatalogItems(items)) {
    const label = item.name.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

/** Columnas completas del Excel para un conjunto de ítems de catálogo. */
export function buildPrediagnosticoExportColumns(items: PrediagnosticoCheckItem[]): string[] {
  return [
    ...PREDIAGNOSTICO_BASE_EXPORT_COLUMNS,
    ...catalogItemColumnLabels(items),
    PREDIAGNOSTICO_CLASE_COLUMN,
    'Observaciones',
  ];
}

function itemIdsForModel(
  modelId: string,
  catalog: PrediagnosticoCheckItem[],
  modelItemProfiles: Map<string, string[]>
): string[] {
  const profile = modelItemProfiles.get(modelId);
  if (profile && profile.length > 0) return profile;
  return catalog.map((i) => i.id);
}

/**
 * Ítems que definen columnas del export.
 * - Sin filtro de modelo: todos los activos del catálogo (orden sort_order).
 * - Con modelId: perfil `cat_prediagnostico_model_items` o catálogo completo si no hay perfil.
 * - Con modelIdsSeen (export masivo): unión de perfiles por modelos presentes en las filas.
 */
export function resolvePrediagnosticoExportItems(input: {
  catalog: PrediagnosticoCheckItem[];
  modelItemProfiles: Map<string, string[]>;
  modelIdFilter?: string;
  modelIdsSeen?: Set<string>;
}): PrediagnosticoCheckItem[] {
  const sorted = sortCatalogItems(input.catalog);
  if (input.modelIdFilter?.trim()) {
    const allowed = new Set(itemIdsForModel(input.modelIdFilter.trim(), sorted, input.modelItemProfiles));
    return sorted.filter((i) => allowed.has(i.id));
  }

  if (input.modelIdsSeen && input.modelIdsSeen.size > 0) {
    const allowed = new Set<string>();
    for (const modelId of input.modelIdsSeen) {
      for (const id of itemIdsForModel(modelId, sorted, input.modelItemProfiles)) {
        allowed.add(id);
      }
    }
    return sorted.filter((i) => allowed.has(i.id));
  }

  return sorted;
}

function formatFuncionamientoSiNo(value: string | undefined): string {
  if (value === 'si') return 'Si';
  if (value === 'no') return 'No';
  return '';
}

function formatCosmeticoSiNo(value: string | undefined): string {
  if (value === 'bien') return 'Si';
  if (value === 'danado') return 'No';
  return '';
}

export function formatClaseCarcasaLetter(clase: string): string {
  const c = clase.trim().toUpperCase();
  const m = c.match(/^([ABCD])$/);
  if (m) return m[1];
  const fromLabel = c.match(/CLASE\s+([ABCD])/i);
  return fromLabel ? fromLabel[1].toUpperCase() : c.slice(0, 1);
}

/** Valores Si/No (y Clase) keyed by nombre de columna del catálogo. */
export function buildPrediagnosticoDynamicCells(input: {
  items: PrediagnosticoCheckItem[];
  functionChecks: Record<string, string>;
  cosmetics: Record<string, string>;
  claseCarcasa: string;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of sortCatalogItems(input.items)) {
    const col = item.name.trim();
    if (!col) continue;
    if (item.kind === 'funcionamiento') {
      out[col] = formatFuncionamientoSiNo(input.functionChecks[item.id]);
    } else {
      out[col] = formatCosmeticoSiNo(input.cosmetics[item.id]);
    }
  }
  out[PREDIAGNOSTICO_CLASE_COLUMN] = formatClaseCarcasaLetter(input.claseCarcasa);
  return out;
}
