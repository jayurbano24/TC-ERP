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
  workshopQueueShowsDiagnosticDetailColumn,
  workshopQueueShowsQcHistoryColumns,
  workshopQueueIsCompactTab,
  WORKSHOP_SCRAPS_COLUMN_WIDTHS,
  workshopQueueShowsScrapReasonColumn,
  workshopQueueShowsScrapResponsableColumn,
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

function plainCell(value: string, muted = false, scraps = false) {
  return (
    <span
      className={`block truncate whitespace-nowrap font-medium ${
        scraps ? 'text-[11px] leading-snug' : 'text-xs'
      } ${muted ? 'text-[var(--muted)]' : 'text-[var(--foreground)]'}`}
      title={value}
    >
      {value}
    </span>
  );
}

function catalogCell(label: string, emptyLabel: string, scraps = false) {
  const empty = label === emptyLabel;
  return (
    <span
      title={label}
      className={`block min-w-0 truncate font-medium ${
        scraps ? 'text-[11px] leading-snug' : 'text-xs'
      } ${empty ? 'text-[var(--muted)] italic' : 'text-[var(--foreground)]'}`}
    >
      {label}
    </span>
  );
}

/** Celda multilínea — detalle completo sin truncar (SCRAPS). */
function detailCell(label: string, emptyLabel: string) {
  const empty = label === emptyLabel;
  return (
    <span
      className={`block min-w-0 whitespace-normal break-words font-medium text-[11px] leading-snug ${
        empty ? 'text-[var(--muted)] italic' : 'text-[var(--foreground)]'
      }`}
    >
      {label}
    </span>
  );
}

const SCRAPS_DETAIL_CELL_CLASS = 'items-start overflow-visible py-1';

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
  const isCompact = workshopQueueIsCompactTab(activeTab);
  const scrapW = WORKSHOP_SCRAPS_COLUMN_WIDTHS;
  const cellText = (value: string, muted = false) => plainCell(value, muted, isCompact);
  const cellCatalog = (label: string, empty: string) => catalogCell(label, empty, isCompact);
  const seriesWidth = (index: number) => {
    if (!isCompact) return 'minmax(96px, 0.85fr)';
    if (index === 0) return scrapW.s1;
    if (index === 1) return scrapW.s2;
    if (index === 2) return scrapW.s3;
    return scrapW.s4;
  };

  const mkFilter = (
    col: WorkshopQueueFilterCol,
    label: string,
    width: string,
    cell: (item: WorkshopQueueRow) => ReactNode,
    options?: { headerClass?: string; cellClassName?: string },
  ): DataTableColumn<WorkshopQueueRow> => ({
    id: col,
    width,
    headerClassName: options?.headerClass,
    cellClassName: options?.cellClassName,
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

  const checkboxClass = isCompact
    ? 'h-3 w-3 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]'
    : 'h-3.5 w-3.5 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]';
  const actionBtnClass = isCompact
    ? 'flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--border)] transition-colors'
    : 'flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--border)] transition-colors';
  const actionIconSize = isCompact ? 11 : 12;

  const columns: DataTableColumn<WorkshopQueueRow>[] = [
    {
      id: 'select',
      width: isCompact ? scrapW.select : '28px',
      align: 'center',
      header: (
        <input
          type="checkbox"
          className={checkboxClass}
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
          className={checkboxClass}
          checked={selectedRows.includes(item.dbId)}
          onChange={(e) => {
            if (e.target.checked) setSelectedRows([...selectedRows, item.dbId]);
            else setSelectedRows(selectedRows.filter((id) => id !== item.dbId));
          }}
        />
      ),
    },
    mkFilter(
      'os',
      'OS',
      isCompact ? scrapW.os : 'minmax(88px, 0.7fr)',
      (item) => cellText(String(item.id || '—')),
    ),
    ...Array.from({ length: seriesSlots }, (_, i) => {
      const col = `s${i + 1}` as WorkshopQueueFilterCol;
      return mkFilter(
        col,
        i === 0 ? 'S1 (SAP)' : `S${i + 1}`,
        seriesWidth(i),
        (item: WorkshopQueueRow) => {
          const serial = seriesAt(item, i);
          if (!serial) return cellText('—', true);
          const isSapS1 =
            i === 0 && /validado/i.test(String(item.series_sap_by_sn?.[serial] || ''));
          return (
            <button
              type="button"
              onClick={() => onShowItemDetail(item)}
              title={serial}
              className={`block w-full min-w-0 truncate text-left font-medium whitespace-nowrap hover:underline ${
                isCompact ? 'text-[11px] leading-snug' : 'text-xs'
              } ${
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
    ...(isCompact
      ? []
      : [
          mkFilter('hist', 'Hist.', '52px', (item) => {
            const label = formatWorkshopStageHistoryLabel(item);
            return cellText(label || '—', !label);
          }),
        ]),
  ];

  if (!hideTechCol) {
    columns.push(
      mkFilter(
        'tec',
        'Tec.',
        isCompact ? scrapW.tec : 'minmax(72px, 0.5fr)',
        (item) => cellText(String(item.tecnologia || '—').toUpperCase()),
      ),
    );
  }

  columns.push(
    mkFilter(
      'modelo',
      'Modelo',
      isCompact ? scrapW.modelo : 'minmax(140px, 0.9fr)',
      (item) => cellText(`${item.marca || ''} ${item.modelo || ''}`.trim().toUpperCase() || '—'),
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

  if (!isCompact) {
    columns.push(
      mkFilter('caja', 'Caja', 'minmax(72px, 0.45fr)', (item) =>
        cellText(String(item.boxCode || '—'), !item.boxCode),
      ),
    );
  }

  if (workshopQueueShowsDiagnosticColumn(activeTab)) {
    columns.push(
      mkFilter(
        'diagnostico',
        'Diagnóstico',
        'minmax(160px, 1.15fr)',
        (item) =>
          cellCatalog(
            String(item.diagnosticoLabel || 'Sin diagnóstico registrado'),
            'Sin diagnóstico registrado',
          ),
      ),
    );
  }

  if (workshopQueueShowsDiagnosticDetailColumn(activeTab)) {
    columns.push(
      mkFilter(
        'detalle_diagnostico',
        isCompact ? 'Diagnóstico' : 'Detalle Diagnóstico',
        isCompact ? scrapW.detalle_diagnostico : 'minmax(200px, 1.35fr)',
        (item) =>
          detailCell(
            String(item.diagnosticoDetalleLabel || 'Sin detalle registrado'),
            'Sin detalle registrado',
          ),
        isCompact ? { cellClassName: SCRAPS_DETAIL_CELL_CLASS } : undefined,
      ),
    );
  }

  if (workshopQueueShowsScrapReasonColumn(activeTab)) {
    columns.push(
      mkFilter(
        'razon_scrap',
        'Razón SCRAPS',
        isCompact ? scrapW.razon_scrap : 'minmax(180px, 1.2fr)',
        (item) =>
          detailCell(
            String(item.scrapReasonLabel || 'Sin razón registrada'),
            'Sin razón registrada',
          ),
        isCompact ? { cellClassName: SCRAPS_DETAIL_CELL_CLASS } : undefined,
      ),
    );
  }

  if (workshopQueueShowsScrapResponsableColumn(activeTab)) {
    columns.push(
      mkFilter(
        'responsable_scrap',
        'Responsable',
        isCompact ? scrapW.responsable_scrap : 'minmax(120px, 0.9fr)',
        (item) =>
          plainCell(String(item.scrapResponsableLabel || '—'), !item.scrapResponsableLabel, isCompact),
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
    mkFilter(
      'fecha',
      'Fecha',
      isCompact ? scrapW.fecha : 'minmax(120px, 0.85fr)',
      (item) => {
        const label = isCompact
          ? String(item.fecha || '—')
          : [item.fecha, item.hora].filter(Boolean).join(' ');
        return cellText(label || '—', !label);
      },
    ),
    ...(isCompact
      ? []
      : [
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
        ]),
    {
      id: 'accion',
      header: 'Acc.',
      width:
        activeTab === 'diagnostico'
          ? '40px'
          : activeTab === 'reparacion'
            ? '116px'
            : activeTab === 'scraps'
              ? isCompact
                ? scrapW.accion
                : '96px'
              : '84px',
      sticky: 'end',
      align: 'right',
      headerClassName: `justify-end ${headerClassName} ${headerTextClassName}`,
      cellClassName: isCompact ? 'self-center' : undefined,
      cell: (item) => (
        <div className="flex items-center justify-end gap-0.5">
          {activeTab === 'reparacion' ? (
            <button
              type="button"
              onClick={() => onRequestPart(item)}
              className={`${actionBtnClass} border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-400 hover:bg-sky-100`}
              title="Solicitar pieza a Bodega de Partes"
              aria-label={`Solicitar pieza para ${item.id || item.sn || 'la OS'}`}
            >
              <PackagePlus size={actionIconSize + 1} />
            </button>
          ) : null}
          {activeTab !== 'diagnostico' ? (
            <button
              type="button"
              onClick={() => onReturnStage(item)}
              className={`${actionBtnClass} text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--heading)]`}
              title="Regresar a otra etapa"
              aria-label="Regresar a otra etapa"
            >
              <RotateCcw size={actionIconSize} />
            </button>
          ) : null}
          {activeTab === 'scraps' ? (
            <button
              type="button"
              onClick={() => onOpenComment(item)}
              className={`${actionBtnClass} text-[var(--muted)] hover:bg-rose-50 hover:text-rose-700`}
              title="Agregar comentario"
              aria-label="Agregar comentario"
            >
              <MessageSquare size={actionIconSize} />
            </button>
          ) : null}
          {activeTab !== 'diagnostico' ? (
            <button
              type="button"
              onClick={() => onOpenHistory(item)}
              className={`${actionBtnClass} text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--heading)]`}
              title="Ver historial"
              aria-label="Ver historial"
            >
              <History size={actionIconSize} />
            </button>
          ) : null}
          {activeTab !== 'scraps' ? (
            <button
              type="button"
              title="Evaluar"
              aria-label="Evaluar"
              className={`${actionBtnClass} bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90`}
              onClick={() => void onOpenOperation(item)}
            >
              <ArrowRight size={actionIconSize} />
            </button>
          ) : null}
        </div>
      ),
    },
  );

  return columns;
}
