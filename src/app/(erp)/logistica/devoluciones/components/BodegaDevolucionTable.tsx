'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, DataTable, TablePagination, type DataTableColumn } from '@/components/ui';
import { Eye, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { getAgenciaLabel } from '@/app/(erp)/produccion/backoffice/backofficeHelpers';
import type { CatalogAgency } from '@/app/(erp)/produccion/backoffice/types';
import type { BoxReturnRow } from '@/modules/returns/client/returnData';

const PAGE_SIZE = 20;

type Props = {
  rows: BoxReturnRow[];
  loading: boolean;
  agencies: CatalogAgency[];
  selectedId: string | null;
  selectedIds: string[];
  /** Cambia al buscar → vuelve a página 1. */
  searchKey?: string;
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
  onSelectRow,
  onToggleSelect,
  onToggleSelectAll,
  onUndo,
  onArchive,
}: Props) {
  const [page, setPage] = useState(1);

  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [searchKey]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, safePage]);

  const pageIds = useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const startItem = totalCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(safePage * PAGE_SIZE, totalCount);

  const columns: DataTableColumn<BoxReturnRow>[] = [
    {
      id: 'select',
      header: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(e) => onToggleSelectAll(e.target.checked, pageIds)}
          className="w-4 h-4 accent-white rounded border-white/30 cursor-pointer"
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
            className="w-4 h-4 accent-rose-500 rounded border-slate-300 cursor-pointer"
          />
        </div>
      ),
    },
    {
      id: 'fecha',
      header: 'Fecha Ingreso',
      width: 'minmax(150px,1fr)',
      cell: (row) => (
        <div className="text-xs font-bold text-slate-500">
          {row.processDate}
          <div className="text-[9px] text-slate-400 uppercase mt-1">Por: {row.processUser}</div>
        </div>
      ),
    },
    {
      id: 'guia',
      header: 'No. Guía / Caja',
      width: 'minmax(160px,1fr)',
      cell: (row) => (
        <span className="text-sm font-black text-[#181c3a] font-mono bg-slate-100 px-3 py-1.5 rounded-lg whitespace-pre-wrap">
          {row.sn}
        </span>
      ),
    },
    {
      id: 'origen',
      header: 'Origen (Agencia)',
      width: 'minmax(160px,1fr)',
      cell: (row) => {
        const agencyLabel = getAgenciaLabel(
          {
            carrier: row.carrier,
            notes: row.receptionNotes,
            reception_guides: [{ guide_number: row.sn, agency: row.agencyRaw }],
          },
          agencies,
          row.sn
        );
        return <span className="text-xs font-black text-[#181c3a] uppercase">{agencyLabel}</span>;
      },
    },
    {
      id: 'notas',
      header: 'Notas de Transferencia',
      width: 'minmax(200px,1.5fr)',
      cell: (row) => (
        <p className="text-xs font-bold text-slate-400 italic max-w-md">
          {row.transferNotes || 'Sin notas adicionales'}
        </p>
      ),
    },
    {
      id: 'estatus',
      header: 'Estatus',
      width: '180px',
      align: 'right',
      cell: (row) => (
        <Badge
          className={`border-none font-black text-[9px] uppercase tracking-widest px-4 py-1.5 rounded-full ${
            row.estatus === 'Procesado' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'
          }`}
        >
          {row.estatus === 'Procesado' ? 'DESPACHADO' : 'BODEGA: DEVOLUCIÓN'}
        </Badge>
      ),
    },
    {
      id: 'acciones',
      header: 'Acciones',
      width: '150px',
      align: 'right',
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelectRow(row); }}
            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-lg transition-colors"
            title="Ver / Despachar"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onUndo(row); }}
            className="p-2 bg-rose-50 hover:bg-rose-500 text-rose-500 hover:text-white rounded-lg transition-colors"
            title="Regresar a Clasificación"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onArchive(row); }}
            className="p-2 bg-slate-50 hover:bg-red-500 text-red-400 hover:text-white rounded-lg transition-colors"
            title="Archivar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <Card className="p-0 bg-white rounded-[2.5rem] shadow-2xl border-none overflow-hidden">
      {loading && rows.length === 0 ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-rose-400 mx-auto" />
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
            minWidth={1020}
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
