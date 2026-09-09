'use client';

import type { ReactNode } from 'react';
import {
  ArrowRight,
  History,
  MessageSquare,
  PackagePlus,
  RotateCcw,
} from 'lucide-react';
import type { DataTableColumn } from '@/components/ui';
import { ExcelColumnFilter, type ExcelFilterSelection } from '@/components/molecules/ExcelColumnFilter';
import { formatWorkshopStageHistoryLabel } from '@/modules/workshop/shared/workshopSeriesDisplay';
import {
  workshopQueueShowsDiagnosticColumn,
  workshopQueueShowsQcHistoryColumns,
  type WorkshopQueueTabId,
} from '@/modules/workshop/shared/workshopQueueTablePolicy';
import type {
  WorkshopQueueFilterCol,
  WorkshopQueueExcelFilters,
} from '@/modules/workshop/shared/workshopQueueColumnFilters';

export type { WorkshopQueueRow } from '@/modules/workshop/shared/workshopQueueColumnFilters';
import type { WorkshopQueueRow } from '@/modules/workshop/shared/workshopQueueColumnFilters';

export type { WorkshopQueueTabId };

export type BuildWorkshopQueueColumnsParams = {
  activeTab: WorkshopQueueTabId;
  seriesSlots: number;
  hideTechCol: boolean;
  tasks: WorkshopQueueRow[];
  selectedRows: string[];
  setSelectedRows: (ids: string[]) => void;
  seriesAt: (item: WorkshopQueueRow, index: number) => string | null;
  ingressLabel: (count: number) => string;
  onShowItemDetail: (item: WorkshopQueueRow) => void;
  onOpenOperation: (item: WorkshopQueueRow) => void;
  onRequestPart: (item: WorkshopQueueRow) => void;
  onReturnStage: (item: WorkshopQueueRow) => void;
  onOpenHistory: (item: WorkshopQueueRow) => void;
  onOpenComment: (item: WorkshopQueueRow) => void;
  headerClassName: string;
  headerTextClassName: string;
  excelFilters: WorkshopQueueExcelFilters;
  filterOptionsByCol: Record<WorkshopQueueFilterCol, string[]>;
  onColFilterChange: (col: WorkshopQueueFilterCol, next: ExcelFilterSelection) => void;
  sortCol: WorkshopQueueFilterCol | null;
  sortDir: 'asc' | 'desc' | null;
  onColSort: (col: WorkshopQueueFilterCol, dir: 'asc' | 'desc' | null) => void;
};

function plainCell(value: string, muted = false) {
  return (
    <span
      className={`block truncate whitespace-nowrap text-xs font-medium ${
        muted ? 'text-[var(--muted)]' : 'text-[var(--foreground)]'
      }`}
      title={value}
    >
      {value}
    </span>
  );
}

function catalogCell(label: string, emptyLabel: string) {
  const empty = label === emptyLabel;
  return (
    <span
      title={label}
      className={`block min-w-0 truncate text-xs font-medium ${
        empty ? 'text-[var(--muted)] italic' : 'text-[var(--foreground)]'
      }`}
    >
      {label}
    </span>
  );
}

export function buildWorkshopQueueColumns({
  activeTab,
  seriesSlots,
  hideTechCol,
  tasks,
  selectedRows,
  setSelectedRows,
  seriesAt,
  ingressLabel,
  onShowItemDetail,
  onOpenOperation,
  onRequestPart,
  onReturnStage,
  onOpenHistory,
  onOpenComment,
  headerClassName,
  headerTextClassName,
  excelFilters,
  filterOptionsByCol,
  onColFilterChange,
  sortCol,
  sortDir,
  onColSort,
}: BuildWorkshopQueueColumnsParams): DataTableColumn<WorkshopQueueRow>[] {
  const mkFilter = (
    col: WorkshopQueueFilterCol,
    label: string,
    width: string,
    cell: (item: WorkshopQueueRow) => ReactNode,
    headerClass?: string,
  ): DataTableColumn<WorkshopQueueRow> => ({
    id: col,
    width,
    headerClassName: headerClass,
    header: (
      <ExcelColumnFilter
        label={label}
        values={filterOptionsByCol[col] ?? []}
        selected={excelFilters[col] ?? null}
        onChange={(next) => onColFilterChange(col, next)}
        sortDir={sortCol === col ? sortDir : null}
        onSort={(dir) => onColSort(col, dir)}
      />
    ),
    cell,
  });

  const columns: DataTableColumn<WorkshopQueueRow>[] = [
    {
      id: 'select',
      width: '28px',
      align: 'center',
      header: (
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
          checked={tasks.length > 0 && selectedRows.length === tasks.length}
          onChange={(e) => {
            if (e.target.checked) setSelectedRows(tasks.map((t) => t.dbId));
            else setSelectedRows([]);
          }}
        />
      ),
      cell: (item) => (
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
          checked={selectedRows.includes(item.dbId)}
          onChange={(e) => {
            if (e.target.checked) setSelectedRows([...selectedRows, item.dbId]);
            else setSelectedRows(selectedRows.filter((id) => id !== item.dbId));
          }}
        />
      ),
    },
    mkFilter('os', 'OS', 'minmax(88px, 0.7fr)', (item) => plainCell(String(item.id || '—'))),
    ...Array.from({ length: seriesSlots }, (_, i) => {
      const col = `s${i + 1}` as WorkshopQueueFilterCol;
      return mkFilter(
        col,
        i === 0 ? 'S1 (SAP)' : `S${i + 1}`,
        'minmax(96px, 0.85fr)',
        (item: WorkshopQueueRow) => {
          const serial = seriesAt(item, i);
          if (!serial) return plainCell('—', true);
          const isSapS1 =
            i === 0 && /validado/i.test(String(item.series_sap_by_sn?.[serial] || ''));
          return (
            <button
              type="button"
              onClick={() => onShowItemDetail(item)}
              title={serial}
              className={`block w-full min-w-0 truncate text-left text-xs font-medium whitespace-nowrap hover:underline ${
                isSapS1
                  ? 'text-emerald-700 font-black'
                  : 'text-[var(--foreground)] hover:text-[var(--heading)]'
              }`}
            >
              {serial}
            </button>
          );
        },
      );
    }),
    mkFilter('hist', 'Hist.', '52px', (item) => {
      const label = formatWorkshopStageHistoryLabel(item);
      return plainCell(label || '—', !label);
    }),
  ];

  if (!hideTechCol) {
    columns.push(
      mkFilter('tec', 'Tec.', 'minmax(72px, 0.5fr)', (item) =>
        plainCell(String(item.tecnologia || '—').toUpperCase()),
      ),
    );
  }

  columns.push(
    mkFilter('modelo', 'Modelo', 'minmax(140px, 0.9fr)', (item) =>
      plainCell(`${item.marca || ''} ${item.modelo || ''}`.trim().toUpperCase() || '—'),
    ),
  );

  if (activeTab === 'reparacion') {
    columns.push(
      mkFilter('sku', 'SKU', 'minmax(88px, 0.7fr)', (item) => {
        const label = String(item.dispatchedSkuLabel || '').trim();
        return (
          <span
            title={label || 'Sin pieza despachada'}
            className={`block min-w-0 truncate font-mono text-[10px] font-bold ${
              label ? 'text-[var(--foreground)]' : 'text-[var(--muted)]'
            }`}
          >
            {label || '—'}
          </span>
        );
      }),
    );
  }

  columns.push(
    mkFilter('caja', 'Caja', 'minmax(72px, 0.45fr)', (item) =>
      plainCell(String(item.boxCode || '—'), !item.boxCode),
    ),
  );

  if (workshopQueueShowsDiagnosticColumn(activeTab)) {
    columns.push(
      mkFilter(
        'diagnostico',
        'Diagnóstico',
        'minmax(160px, 1.15fr)',
        (item) =>
          catalogCell(
            String(item.diagnosticoLabel || 'Sin diagnóstico registrado'),
            'Sin diagnóstico registrado',
          ),
      ),
    );
  }

  if (workshopQueueShowsQcHistoryColumns(activeTab)) {
    columns.push(
      mkFilter(
        'reparacion',
        'Reparación',
        'minmax(160px, 1.05fr)',
        (item) =>
          catalogCell(
            String(item.reparacionLabel || 'Sin reparación registrada'),
            'Sin reparación registrada',
          ),
      ),
      mkFilter(
        'reacondicionado',
        'Reacondicionado',
        'minmax(160px, 1.05fr)',
        (item) =>
          catalogCell(
            String(item.reacondicionadoLabel || 'Sin reacondicionado registrado'),
            'Sin reacondicionado registrado',
          ),
      ),
    );
  }

  columns.push(
    mkFilter('fecha', 'Fecha', 'minmax(120px, 0.85fr)', (item) => {
      const label = [item.fecha, item.hora].filter(Boolean).join(' ');
      return plainCell(label || '—', !label);
    }),
    mkFilter('ingresos', 'Ingresos', 'minmax(96px, 0.7fr)', (item) => {
      const label = ingressLabel(Number(item.ingress_count) || 1);
      const isReentry = Number(item.ingress_count) >= 2;
      return (
        <span
          className={`block truncate whitespace-nowrap text-xs font-medium ${
            isReentry ? 'font-black text-violet-700' : 'text-[var(--foreground)]'
          }`}
          title={label}
        >
          {label}
        </span>
      );
    }),
    {
      id: 'accion',
      header: 'Acc.',
      width:
        activeTab === 'diagnostico'
          ? '40px'
          : activeTab === 'reparacion'
            ? '116px'
            : activeTab === 'scraps'
              ? '96px'
              : '84px',
      sticky: 'end',
      align: 'right',
      headerClassName: `justify-end ${headerClassName} ${headerTextClassName}`,
      cell: (item) => (
        <div className="flex items-center justify-end gap-0.5">
          {activeTab === 'reparacion' ? (
            <button
              type="button"
              onClick={() => onRequestPart(item)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-sky-200 bg-sky-50 text-sky-700 transition-colors hover:border-sky-400 hover:bg-sky-100"
              title="Solicitar pieza a Bodega de Partes"
              aria-label={`Solicitar pieza para ${item.id || item.sn || 'la OS'}`}
            >
              <PackagePlus size={13} />
            </button>
          ) : null}
          {activeTab !== 'diagnostico' ? (
            <button
              type="button"
              onClick={() => onReturnStage(item)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--heading)]"
              title="Regresar a otra etapa"
              aria-label="Regresar a otra etapa"
            >
              <RotateCcw size={12} />
            </button>
          ) : null}
          {activeTab === 'scraps' ? (
            <button
              type="button"
              onClick={() => onOpenComment(item)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-rose-50 hover:text-rose-700"
              title="Agregar comentario"
              aria-label="Agregar comentario"
            >
              <MessageSquare size={12} />
            </button>
          ) : null}
          {activeTab !== 'diagnostico' ? (
            <button
              type="button"
              onClick={() => onOpenHistory(item)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--heading)]"
              title="Ver historial"
              aria-label="Ver historial"
            >
              <History size={12} />
            </button>
          ) : null}
          {activeTab !== 'scraps' ? (
            <button
              type="button"
              title="Evaluar"
              aria-label="Evaluar"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--border)] bg-[var(--primary)] text-[var(--primary-foreground)] transition-colors hover:opacity-90"
              onClick={() => void onOpenOperation(item)}
            >
              <ArrowRight size={12} />
            </button>
          ) : null}
        </div>
      ),
    },
  );

  return columns;
}
