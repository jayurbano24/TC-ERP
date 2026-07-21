'use client';

import { memo, useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export type DataTableAlign = 'left' | 'center' | 'right';

export interface DataTableColumn<T> {
  /** Identificador único de la columna. */
  id: string;
  /** Contenido de la cabecera. */
  header: ReactNode;
  /** Render de la celda para una fila. */
  cell: (row: T, index: number) => ReactNode;
  /**
   * Track de CSS grid para la columna (p. ej. '120px', 'minmax(120px,1fr)',
   * '1fr'). Por defecto '1fr'.
   */
  width?: string;
  align?: DataTableAlign;
  /** Mantiene la columna visible al hacer scroll horizontal. */
  sticky?: 'end';
  headerClassName?: string;
  cellClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /** Clave estable por fila (evita remounts y bugs de virtualización). */
  getRowId: (row: T, index: number) => string | number;
  onRowClick?: (row: T, index: number) => void;
  /** Alto fijo de fila en px (la virtualización lo necesita). Default 44. */
  rowHeight?: number;
  /** Alto máximo del cuerpo scrolleable en px. Default 520. */
  maxBodyHeight?: number;
  /**
   * A partir de cuántas filas se activa la virtualización. Por debajo se
   * renderiza todo en flujo normal (tablas chicas no pagan el costo). Default 60.
   */
  virtualizeThreshold?: number;
  overscan?: number;
  emptyMessage?: string;
  /** Ancho mínimo para habilitar scroll horizontal en tablas anchas. */
  minWidth?: number | string;
  /** Si true, padding reducido en celdas (tablas densas). */
  compact?: boolean;
  className?: string;
  rowClassName?: (row: T, index: number) => string | undefined;
  ariaLabel?: string;
  /** Clases para el contenedor de la cabecera (fondo/borde). */
  headerClassName?: string;
  /** Clases de texto base para las celdas de cabecera. */
  headerTextClassName?: string;
}

const ALIGN_CLASS: Record<DataTableAlign, string> = {
  left: 'justify-start text-left',
  center: 'justify-center text-center',
  right: 'justify-end text-right',
};

/**
 * Tabla virtualizada y reutilizable (C3).
 *
 * - Layout por CSS grid: cabecera y filas comparten `gridTemplateColumns`, así
 *   las columnas quedan alineadas incluso con virtualización (posición
 *   absoluta).
 * - Solo virtualiza cuando `data.length > virtualizeThreshold`: las tablas
 *   pequeñas se renderizan en flujo normal y conservan su alto natural.
 * - Renderiza únicamente las filas visibles (+overscan), evitando volcar miles
 *   de nodos al DOM.
 */
function DataTableComponent<T>({
  columns,
  data,
  getRowId,
  onRowClick,
  rowHeight = 44,
  maxBodyHeight = 520,
  virtualizeThreshold = 60,
  overscan = 10,
  emptyMessage = 'Sin registros',
  minWidth,
  compact = false,
  className = '',
  rowClassName,
  ariaLabel,
  headerClassName = 'border-b border-[var(--border)] bg-[var(--surface)]',
  headerTextClassName = 'text-[var(--muted)]',
}: DataTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const gridTemplateColumns = columns.map((c) => c.width ?? '1fr').join(' ');
  const shouldVirtualize = data.length > virtualizeThreshold;

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  const clickable = Boolean(onRowClick);

  const cellPad = compact ? 'px-1.5 py-1' : 'px-3';
  const headerPad = compact ? 'px-1.5 py-1' : 'px-3 py-3';
  const rowText = compact ? 'text-[10px]' : 'text-xs';

  const stickyEndClass = (col: DataTableColumn<T>, isHeader = false) =>
    col.sticky === 'end'
      ? `sticky right-0 z-20 shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.12)] ${
          isHeader
            ? // Hereda el fondo de cabecera (primary / surface); evita tapa blanca en dark.
              'bg-[inherit]'
            : 'bg-[var(--surface)] group-hover:bg-[var(--surface-hover)]'
        }`
      : '';

  const minWidthStyle =
    minWidth == null
      ? undefined
      : { minWidth: typeof minWidth === 'number' ? `${minWidth}px` : minWidth };

  const renderCells = (row: T, index: number) =>
    columns.map((col) => (
      <div
        key={col.id}
        className={`flex items-center ${cellPad} min-w-0 ${col.sticky === 'end' ? 'overflow-visible' : 'overflow-hidden'} ${ALIGN_CLASS[col.align ?? 'left']} ${stickyEndClass(col)} ${col.cellClassName ?? ''}`}
      >
        {col.cell(row, index)}
      </div>
    ));

  // Scroll vertical interno; el horizontal lo controla el wrapper del padre
  // (así la barra lateral siempre es visible y la cabecera no se desacopla).
  return (
    <div
      className={`w-full ${className}`}
      style={minWidthStyle}
      role="table"
      aria-label={ariaLabel}
    >
      <div
        role="row"
        className={`grid w-full sticky top-0 z-30 ${headerClassName}`}
        style={{ gridTemplateColumns }}
      >
        {columns.map((col) => (
          <div
            key={col.id}
            role="columnheader"
            className={`flex items-center ${headerPad} text-[9px] uppercase tracking-wide font-semibold ${headerTextClassName} ${ALIGN_CLASS[col.align ?? 'left']} ${stickyEndClass(col, true)} ${col.headerClassName ?? ''} min-w-0`}
          >
            {col.header}
          </div>
        ))}
      </div>

      {data.length === 0 ? (
        <div className="p-6 text-center text-[var(--muted)] text-sm font-medium">{emptyMessage}</div>
      ) : (
        <div
          ref={parentRef}
          className="overflow-y-auto overflow-x-hidden custom-scrollbar"
          style={{ maxHeight: maxBodyHeight }}
        >
          {shouldVirtualize ? (
            <div
              style={{
                height: rowVirtualizer.getTotalSize(),
                position: 'relative',
                width: '100%',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((vItem) => {
                const row = data[vItem.index];
                return (
                  <div
                    key={getRowId(row, vItem.index)}
                    role="row"
                    onClick={clickable ? () => onRowClick!(row, vItem.index) : undefined}
                    className={`group grid items-center border-b border-[var(--border)] ${rowText} font-medium hover:bg-[var(--surface-hover)] ${clickable ? 'cursor-pointer' : ''} ${rowClassName?.(row, vItem.index) ?? ''}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: vItem.size,
                      transform: `translateY(${vItem.start}px)`,
                      gridTemplateColumns,
                      color: 'var(--foreground)',
                    }}
                  >
                    {renderCells(row, vItem.index)}
                  </div>
                );
              })}
            </div>
          ) : (
            data.map((row, index) => (
              <div
                key={getRowId(row, index)}
                role="row"
                onClick={clickable ? () => onRowClick!(row, index) : undefined}
                className={`group grid w-full items-center border-b border-[var(--border)] ${rowText} font-medium hover:bg-[var(--surface-hover)] ${clickable ? 'cursor-pointer' : ''} ${rowClassName?.(row, index) ?? ''}`}
                style={{
                  gridTemplateColumns,
                  minHeight: rowHeight,
                  color: 'var(--foreground)',
                }}
              >
                {renderCells(row, index)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * C1: `DataTable` memoizado. No vuelve a renderizar cuando el padre re-renderiza
 * por estado no relacionado; solo si cambian sus props (comparación shallow).
 * Para que el memo "enganche", el padre debe pasar props estables
 * (`columns`/`getRowId`/callbacks memoizados con useMemo/useCallback o a nivel de
 * módulo). El cast conserva la firma genérica del componente.
 */
export const DataTable = memo(DataTableComponent) as typeof DataTableComponent;
