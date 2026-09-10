'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, DataTable, TablePagination, type DataTableColumn } from '@/components/ui';
import { ExcelColumnFilter, type ExcelFilterSelection } from '@/components/molecules/ExcelColumnFilter';
import { Eye, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import type { CatalogAgency } from '@/app/(erp)/produccion/backoffice/types';
import type { BoxReturnRow } from '@/modules/returns/client/returnData';
import { displayTransferNotes } from '@/modules/returns/client/returnData';
import {
  agencyLabelForRow,
  bodegaDevolucionCellValue,
  createEmptyBodegaDevolucionExcelFilters,
  estatusDisplay,
  hasActiveBodegaDevolucionExcelFilters,
  matchesBodegaDevolucionExcelFilters,
  uniqueBodegaDevolucionValues,
  type BodegaDevolucionExcelFilters,
  type BodegaDevolucionFilterCol,
} from '@/modules/returns/shared/bodegaDevolucionColumnFilters';

const PAGE_SIZE = 20;

type Props = {
  rows: BoxReturnRow[];
  loading: boolean;
  agencies: CatalogAgency[];
  selectedId: string | null;
  selectedIds: string[];
  /** Cambia al buscar → vuelve a página 1. */
  searchKey?: string;
  onFilteredCountChange?: (count: number) => void;
  onSelectRow: (row: BoxReturnRow) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  /** Select / deselect only the visible page ids (pagination-aware). */
  onToggleSelectAll: (checked: boolean, visibleIds: string[]) => void;
  onUndo: (row: BoxReturnRow) => void;
  onArchive: (row: BoxReturnRow) => void;
};

export function BodegaDevolucionTable({
  rows,
  loading,
  agencies,
  selectedId,
  selectedIds,
  searchKey = '',
  onFilteredCountChange,
  onSelectRow,
  onToggleSelect,
  onToggleSelectAll,
  onUndo,
  onArchive,
}: Props) {
  const [page, setPage] = useState(1);
  const [excelFilters, setExcelFilters] = useState<BodegaDevolucionExcelFilters>(() =>
    createEmptyBodegaDevolucionExcelFilters(),
  );
  const [sortCol, setSortCol] = useState<BodegaDevolucionFilterCol | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);

  const setColFilter = useCallback((col: BodegaDevolucionFilterCol, next: ExcelFilterSelection) => {
    setExcelFilters((prev) => ({ ...prev, [col]: next }));
    setPage(1);
  }, []);

  const setColSort = useCallback((col: BodegaDevolucionFilterCol, dir: 'asc' | 'desc' | null) => {
    if (dir == null) {
      setSortCol(null);
      setSortDir(null);
      return;
    }
    setSortCol(col);
    setSortDir(dir);
    setPage(1);
  }, []);

  const clearExcelFilters = useCallback(() => {
    setExcelFilters(createEmptyBodegaDevolucionExcelFilters());
    setSortCol(null);
    setSortDir(null);
    setPage(1);
  }, []);

  const hasActiveExcelFilters = hasActiveBodegaDevolucionExcelFilters(excelFilters);

  const optionRowsByCol = useMemo(() => {
    const map = {} as Record<BodegaDevolucionFilterCol, string[]>;
    const cols: BodegaDevolucionFilterCol[] = [
      'fecha',
      'clasificadoPor',
      'guia',
      'origen',
      'notas',
      'estatus',
    ];
    for (const col of cols) {
      const pool = rows.filter((row) => matchesBodegaDevolucionExcelFilters(row, excelFilters, agencies, col));
      map[col] = uniqueBodegaDevolucionValues(pool, col, agencies);
    }
    return map;
  }, [rows, excelFilters, agencies]);

  const filteredRows = useMemo(() => {
    let list = rows.filter((row) => matchesBodegaDevolucionExcelFilters(row, excelFilters, agencies));
    if (sortCol && sortDir) {
      list = [...list].sort((a, b) => {
        const av = bodegaDevolucionCellValue(a, sortCol, agencies);
        const bv = bodegaDevolucionCellValue(b, sortCol, agencies);
        const cmp = av.localeCompare(bv, 'es', { sensitivity: 'base', numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [rows, excelFilters, agencies, sortCol, sortDir]);

  useEffect(() => {
    onFilteredCountChange?.(filteredRows.length);
  }, [filteredRows.length, onFilteredCountChange]);

  const totalCount = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [searchKey]);

  useEffect(() => {
    setPage(1);
  }, [excelFilters, sortCol, sortDir]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safePage]);

  const pageIds = useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const startItem = totalCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(safePage * PAGE_SIZE, totalCount);

  const mkFilter = (
    col: BodegaDevolucionFilterCol,
    label: string,
    width: string,
    cell: (row: BoxReturnRow) => React.ReactNode,
    options?: { align?: 'left' | 'center' | 'right' },
  ): DataTableColumn<BoxReturnRow> => ({
    id: col,
    width,
    align: options?.align,
    header: (
      <ExcelColumnFilter
        label={label}
        values={optionRowsByCol[col] ?? []}
        selected={excelFilters[col]}
        onChange={(next) => setColFilter(col, next)}
        sortDir={sortCol === col ? sortDir : null}
        onSort={(dir) => setColSort(col, dir)}
        inverted
      />
    ),
    cell,
  });

  const columns: DataTableColumn<BoxReturnRow>[] = useMemo(
    () => [
      {
        id: 'select',
        header: (
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onToggleSelectAll(e.target.checked, pageIds)}
            className="h-4 w-4 cursor-pointer rounded border-white/30 accent-white"
          />
        ),
        width: '52px',
        align: 'center',
        cell: (row) => (
          <div onClick={(e) => e.stopPropagation()} className="flex justify-center">
            <input
              type="checkbox"
              checked={selectedIds.includes(row.id)}
              onChange={(e) => onToggleSelect(row.id, e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-rose-500"
            />
          </div>
        ),
      },
      mkFilter(
        'fecha',
        'Fecha Ingreso',
        'minmax(140px,0.9fr)',
        (row) => <div className="text-xs font-bold text-slate-600">{row.processDate}</div>,
      ),
      mkFilter(
        'clasificadoPor',
        'Clasificado por',
        'minmax(160px,1.1fr)',
        (row) => (
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Usuario</p>
            <p
              className="truncate text-xs font-black uppercase text-[#181c3a]"
              title={row.processUser}
            >
              {row.processUser || 'Sin registro'}
            </p>
          </div>
        ),
      ),
      mkFilter(
        'guia',
        'No. Guía / Caja',
        'minmax(160px,1fr)',
        (row) => (
          <span className="whitespace-pre-wrap rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-sm font-black text-[#181c3a]">
            {row.sn}
          </span>
        ),
      ),
      mkFilter(
        'origen',
        'Origen (Agencia)',
        'minmax(160px,1fr)',
        (row) => (
          <span className="text-xs font-black uppercase text-[#181c3a]">
            {agencyLabelForRow(row, agencies)}
          </span>
        ),
      ),
      mkFilter(
        'notas',
        'Notas de Transferencia',
        'minmax(200px,1.5fr)',
        (row) => (
          <p className="max-w-md text-xs font-bold italic text-slate-400">
            {displayTransferNotes(row.transferNotes)}
          </p>
        ),
      ),
      mkFilter(
        'estatus',
        'Estatus',
        '180px',
        (row) => (
          <Badge
            className={`rounded-full border-none px-4 py-1.5 text-[9px] font-black uppercase tracking-widest ${
              row.estatus === 'Procesado' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'
            }`}
          >
            {estatusDisplay(row)}
          </Badge>
        ),
        { align: 'right' },
      ),
      {
        id: 'acciones',
        header: 'Acciones',
        width: '150px',
        align: 'right',
        cell: (row) => (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectRow(row);
              }}
              className="rounded-lg bg-slate-50 p-2 text-slate-400 transition-colors hover:bg-slate-100"
              title="Ver / Despachar"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUndo(row);
              }}
              className="rounded-lg bg-rose-50 p-2 text-rose-500 transition-colors hover:bg-rose-500 hover:text-white"
              title="Regresar a Clasificación"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onArchive(row);
              }}
              className="rounded-lg bg-slate-50 p-2 text-red-400 transition-colors hover:bg-red-500 hover:text-white"
              title="Archivar"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ],
    [
      agencies,
      allSelected,
      excelFilters,
      onArchive,
      onSelectRow,
      onToggleSelect,
      onToggleSelectAll,
      onUndo,
      optionRowsByCol,
      pageIds,
      selectedIds,
      setColFilter,
      setColSort,
      sortCol,
      sortDir,
    ],
  );

  return (
    <Card className="overflow-hidden rounded-[2.5rem] border-none bg-white p-0 shadow-2xl">
      {hasActiveExcelFilters || sortDir ? (
        <div className="flex items-center justify-between gap-2 border-b border-rose-100 bg-rose-50/60 px-4 py-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-rose-700">
            Filtros Excel activos · {totalCount} de {rows.length} cajas
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-[9px] font-black uppercase"
            onClick={clearExcelFilters}
          >
            <X className="h-3 w-3" />
            Limpiar filtros
          </Button>
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <div className="py-20 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-rose-400" />
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={pageRows}
            getRowId={(row: BoxReturnRow) => row.id}
            onRowClick={(row: BoxReturnRow) => onSelectRow(row)}
            rowHeight={76}
            maxBodyHeight={600}
            minWidth={1180}
            headerClassName="bg-rose-500"
            headerTextClassName="text-white"
            emptyMessage="No hay cajas en bodega devolución"
            rowClassName={(row: BoxReturnRow) =>
              `group cursor-pointer ${selectedId === row.id ? 'bg-rose-50/60' : ''} ${selectedIds.includes(row.id) ? 'bg-blue-50/40' : ''}`
            }
          />
          <TablePagination
            totalCount={totalCount}
            page={safePage}
            totalPages={totalPages}
            startItem={startItem}
            endItem={endItem}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="cajas"
          />
        </>
      )}
    </Card>
  );
}
