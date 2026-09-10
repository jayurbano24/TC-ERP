import type { ExcelFilterSelection } from '@/components/molecules/ExcelColumnFilter';
import { getAgenciaLabel } from '@/app/(erp)/produccion/backoffice/backofficeHelpers';
import type { CatalogAgency } from '@/app/(erp)/produccion/backoffice/types';
import type { BoxReturnRow } from '@/modules/returns/client/returnData';
import { displayTransferNotes } from '@/modules/returns/client/returnData';

export type BodegaDevolucionFilterCol =
  | 'fecha'
  | 'clasificadoPor'
  | 'guia'
  | 'origen'
  | 'notas'
  | 'estatus';

export type BodegaDevolucionExcelFilters = Record<BodegaDevolucionFilterCol, ExcelFilterSelection>;

export const BODEGA_DEVOLUCION_FILTER_COLS: BodegaDevolucionFilterCol[] = [
  'fecha',
  'clasificadoPor',
  'guia',
  'origen',
  'notas',
  'estatus',
];

export function createEmptyBodegaDevolucionExcelFilters(): BodegaDevolucionExcelFilters {
  return {
    fecha: null,
    clasificadoPor: null,
    guia: null,
    origen: null,
    notas: null,
    estatus: null,
  };
}

export function estatusDisplay(row: BoxReturnRow): string {
  return row.estatus === 'Procesado' ? 'DESPACHADO' : 'BODEGA: DEVOLUCIÓN';
}

export function agencyLabelForRow(row: BoxReturnRow, agencies: CatalogAgency[]): string {
  return getAgenciaLabel(
    {
      carrier: row.carrier,
      notes: row.receptionNotes,
      reception_guides: [{ guide_number: row.sn, agency: row.agencyRaw }],
    },
    agencies,
    row.sn,
  );
}

export function bodegaDevolucionCellValue(
  row: BoxReturnRow,
  col: BodegaDevolucionFilterCol,
  agencies: CatalogAgency[],
): string {
  switch (col) {
    case 'fecha':
      return row.processDate || '—';
    case 'clasificadoPor':
      return row.processUser || 'Sin registro';
    case 'guia':
      return row.sn || '—';
    case 'origen':
      return agencyLabelForRow(row, agencies);
    case 'notas':
      return displayTransferNotes(row.transferNotes) || '—';
    case 'estatus':
      return estatusDisplay(row);
    default:
      return '—';
  }
}

export function uniqueBodegaDevolucionValues(
  rows: BoxReturnRow[],
  col: BodegaDevolucionFilterCol,
  agencies: CatalogAgency[],
): string[] {
  const set = new Set<string>();
  for (const row of rows) set.add(bodegaDevolucionCellValue(row, col, agencies));
  return [...set].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true }));
}

export function matchesBodegaDevolucionExcelFilters(
  row: BoxReturnRow,
  filters: BodegaDevolucionExcelFilters,
  agencies: CatalogAgency[],
  except?: BodegaDevolucionFilterCol,
): boolean {
  for (const col of BODEGA_DEVOLUCION_FILTER_COLS) {
    if (except && col === except) continue;
    const sel = filters[col];
    if (sel == null) continue;
    if (sel.size === 0) return false;
    if (!sel.has(bodegaDevolucionCellValue(row, col, agencies))) return false;
  }
  return true;
}

export function hasActiveBodegaDevolucionExcelFilters(
  filters: BodegaDevolucionExcelFilters,
): boolean {
  return BODEGA_DEVOLUCION_FILTER_COLS.some((col) => filters[col] != null);
}
