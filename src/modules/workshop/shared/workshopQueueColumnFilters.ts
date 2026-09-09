import { formatWorkshopStageHistoryLabel } from '@/modules/workshop/shared/workshopSeriesDisplay';
import type { ExcelFilterSelection } from '@/components/molecules/ExcelColumnFilter';
import {
  workshopQueueShowsDiagnosticColumn,
  workshopQueueShowsQcHistoryColumns,
  type WorkshopQueueTabId,
} from '@/modules/workshop/shared/workshopQueueTablePolicy';

export type WorkshopQueueRow = {
  id?: string;
  dbId: string;
  groupId?: string;
  sn?: string;
  all_sns?: string[];
  tecnologia?: string;
  marca?: string;
  modelo?: string;
  boxCode?: string;
  dispatchedSkuLabel?: string;
  ingress_count?: number;
  fecha?: string;
  hora?: string;
  series_sap_by_sn?: Record<string, string | null>;
  diagnosticoLabel?: string;
  reparacionLabel?: string;
  reacondicionadoLabel?: string;
  passed_repair?: boolean;
  passed_reacond?: boolean;
};

export type WorkshopQueueFilterCol =
  | 'os'
  | 's1'
  | 's2'
  | 's3'
  | 's4'
  | 'hist'
  | 'tec'
  | 'modelo'
  | 'sku'
  | 'caja'
  | 'diagnostico'
  | 'reparacion'
  | 'reacondicionado'
  | 'fecha'
  | 'ingresos';

export type WorkshopQueueExcelFilters = Record<WorkshopQueueFilterCol, ExcelFilterSelection>;

export function createEmptyWorkshopQueueExcelFilters(
  tab: WorkshopQueueTabId,
): WorkshopQueueExcelFilters {
  const cols = workshopQueueFilterColumnsForTab(tab);
  const empty = {} as WorkshopQueueExcelFilters;
  for (const col of cols) empty[col] = null;
  return empty;
}

export function workshopQueueFilterColumnsForTab(tab: WorkshopQueueTabId): WorkshopQueueFilterCol[] {
  const cols: WorkshopQueueFilterCol[] = [
    'os',
    's1',
    's2',
    's3',
    's4',
    'hist',
    'tec',
    'modelo',
  ];
  if (tab === 'reparacion') cols.push('sku');
  cols.push('caja');
  if (workshopQueueShowsDiagnosticColumn(tab)) cols.push('diagnostico');
  if (workshopQueueShowsQcHistoryColumns(tab)) {
    cols.push('reparacion', 'reacondicionado');
  }
  cols.push('fecha', 'ingresos');
  return cols;
}

export function workshopQueueCellValue(
  row: WorkshopQueueRow,
  col: WorkshopQueueFilterCol,
  helpers: {
    seriesAt: (item: WorkshopQueueRow, index: number) => string | null;
    ingressLabel: (count: number) => string;
  },
): string {
  switch (col) {
    case 'os':
      return String(row.id || '—');
    case 's1':
      return helpers.seriesAt(row, 0) || '—';
    case 's2':
      return helpers.seriesAt(row, 1) || '—';
    case 's3':
      return helpers.seriesAt(row, 2) || '—';
    case 's4':
      return helpers.seriesAt(row, 3) || '—';
    case 'hist':
      return formatWorkshopStageHistoryLabel(row) || '—';
    case 'tec':
      return String(row.tecnologia || '—').toUpperCase();
    case 'modelo':
      return `${row.marca || ''} ${row.modelo || ''}`.trim().toUpperCase() || '—';
    case 'sku':
      return String(row.dispatchedSkuLabel || '').trim() || '—';
    case 'caja':
      return String(row.boxCode || '—');
    case 'diagnostico':
      return String(row.diagnosticoLabel || 'Sin diagnóstico registrado');
    case 'reparacion':
      return String(row.reparacionLabel || 'Sin reparación registrada');
    case 'reacondicionado':
      return String(row.reacondicionadoLabel || 'Sin reacondicionado registrado');
    case 'fecha':
      return [row.fecha, row.hora].filter(Boolean).join(' ') || '—';
    case 'ingresos':
      return helpers.ingressLabel(Number(row.ingress_count) || 1);
    default:
      return '—';
  }
}

export function workshopQueueUniqueValues(
  rows: WorkshopQueueRow[],
  col: WorkshopQueueFilterCol,
  helpers: {
    seriesAt: (item: WorkshopQueueRow, index: number) => string | null;
    ingressLabel: (count: number) => string;
  },
): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    set.add(workshopQueueCellValue(row, col, helpers));
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true }));
}

export function matchesWorkshopQueueExcelFilters(
  row: WorkshopQueueRow,
  filters: WorkshopQueueExcelFilters,
  helpers: {
    seriesAt: (item: WorkshopQueueRow, index: number) => string | null;
    ingressLabel: (count: number) => string;
  },
  except?: WorkshopQueueFilterCol,
): boolean {
  for (const col of Object.keys(filters) as WorkshopQueueFilterCol[]) {
    if (except && col === except) continue;
    const sel = filters[col];
    if (sel == null) continue;
    if (!sel.has(workshopQueueCellValue(row, col, helpers))) return false;
  }
  return true;
}

export function hasActiveWorkshopQueueExcelFilters(filters: WorkshopQueueExcelFilters): boolean {
  return Object.values(filters).some((sel) => sel != null);
}
