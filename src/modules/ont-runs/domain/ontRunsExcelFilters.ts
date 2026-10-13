import type { ExcelFilterSelection } from '@/components/molecules/ExcelColumnFilter';
import type { OntRunRowEntry } from './groupOntRunsBySerial';
import { normalizeOntRunSerial } from './groupOntRunsBySerial';
import { resolveOntRunBrandModel } from './resolveOntRunBrandModel';

export type OntRunExcelFilterCol = 'fecha' | 'runId' | 'serial' | 'brand' | 'model' | 'lab' | 'verdict';

export type OntRunExcelFilters = Record<OntRunExcelFilterCol, ExcelFilterSelection>;

export const EMPTY_ONT_RUN_EXCEL_FILTERS: OntRunExcelFilters = {
  fecha: null,
  runId: null,
  serial: null,
  brand: null,
  model: null,
  lab: null,
  verdict: null,
};

export const ONT_RUN_EXCEL_FILTER_COLS: OntRunExcelFilterCol[] = [
  'fecha',
  'runId',
  'serial',
  'brand',
  'model',
  'lab',
  'verdict',
];

function formatRecordedAtCompact(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ontRunExcelCellValue(entry: OntRunRowEntry, col: OntRunExcelFilterCol): string {
  const run = entry.run;
  switch (col) {
    case 'fecha':
      return formatRecordedAtCompact(run.recordedAt);
    case 'runId':
      return run.runId.trim() || '—';
    case 'serial':
      return normalizeOntRunSerial(run.serial) || '—';
    case 'brand':
      return resolveOntRunBrandModel(run).brand || '—';
    case 'model':
      return resolveOntRunBrandModel(run).model || '—';
    case 'lab':
      return run.station?.trim() || '—';
    case 'verdict':
      return run.verdict?.trim().toUpperCase() || '—';
    default:
      return '—';
  }
}

export function uniqueOntRunExcelValues(
  entries: OntRunRowEntry[],
  col: OntRunExcelFilterCol
): string[] {
  const set = new Set<string>();
  for (const entry of entries) {
    set.add(ontRunExcelCellValue(entry, col));
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true }));
}

export function matchesOntRunExcelFilters(
  entry: OntRunRowEntry,
  filters: OntRunExcelFilters,
  except?: OntRunExcelFilterCol
): boolean {
  for (const col of ONT_RUN_EXCEL_FILTER_COLS) {
    if (except && col === except) continue;
    const sel = filters[col];
    if (sel == null) continue;
    if (!sel.has(ontRunExcelCellValue(entry, col))) return false;
  }
  return true;
}

export function hasActiveOntRunExcelFilters(filters: OntRunExcelFilters): boolean {
  return ONT_RUN_EXCEL_FILTER_COLS.some((col) => filters[col] != null);
}

export function filterOntRunEntriesByExcel(
  entries: OntRunRowEntry[],
  filters: OntRunExcelFilters,
  sortCol: OntRunExcelFilterCol | null,
  sortDir: 'asc' | 'desc' | null
): OntRunRowEntry[] {
  let list = entries.filter((entry) => matchesOntRunExcelFilters(entry, filters));

  if (sortCol && sortDir) {
    list = [...list].sort((a, b) => {
      const av = ontRunExcelCellValue(a, sortCol);
      const bv = ontRunExcelCellValue(b, sortCol);
      const cmp = av.localeCompare(bv, 'es', { sensitivity: 'base', numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  return list;
}

export function ontRunExcelColumnLabel(col: OntRunExcelFilterCol): string {
  const labels: Record<OntRunExcelFilterCol, string> = {
    fecha: 'Fecha',
    runId: 'ONT RUN',
    serial: 'Serie',
    brand: 'Marca',
    model: 'Modelo',
    lab: 'Lab',
    verdict: 'Vered.',
  };
  return labels[col];
}
