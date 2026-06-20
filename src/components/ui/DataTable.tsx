'use client';

import React, { useMemo, useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Spinner } from './Spinner';
import { ErpIcon } from '@/lib/design/icons';
import { erpLayout, erpTypography } from '@/lib/design/tokens';

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  accessor?: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  hideBelow?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'center' | 'right';
};

type DataTableProps<T> = {
  title?: string;
  subtitle?: string;
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Filtrado cliente cuando no hay onSearchChange externo */
  searchFilter?: (row: T, term: string) => boolean;
  filters?: React.ReactNode;
  toolbarActions?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  isLoading?: boolean;
  stickyHeader?: boolean;
  compact?: boolean;
  className?: string;
};

const hideClass: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

const alignClass = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/** Tabla avanzada con búsqueda, filtros y scroll responsive. */
export function DataTable<T>({
  title,
  subtitle,
  columns,
  data,
  rowKey,
  searchPlaceholder = 'Buscar registros...',
  searchValue,
  onSearchChange,
  searchFilter,
  filters,
  toolbarActions,
  emptyTitle = 'Sin registros',
  emptyDescription = 'No hay datos que coincidan con los filtros actuales.',
  isLoading = false,
  stickyHeader = true,
  compact = false,
  className = '',
}: DataTableProps<T>) {
  const [internalSearch, setInternalSearch] = useState('');
  const term = searchValue ?? internalSearch;
  const setTerm = onSearchChange ?? setInternalSearch;

  const filtered = useMemo(() => {
    if (!term.trim() || !searchFilter) return data;
    const q = term.trim().toLowerCase();
    return data.filter((row) => searchFilter(row, q));
  }, [data, term, searchFilter]);

  const cellPad = compact ? 'px-3 py-2.5' : 'px-4 sm:px-6 py-3 sm:py-4';
  const showSearch = Boolean(onSearchChange || searchFilter);

  return (
    <Card padding="none" className={`overflow-hidden border border-slate-100 ${className}`}>
      {(title || subtitle || showSearch || filters || toolbarActions) && (
        <div className="p-4 sm:p-5 border-b border-slate-100 space-y-4">
          {(title || subtitle) && (
            <div>
              {title && <h3 className={erpTypography.sectionTitle}>{title}</h3>}
              {subtitle && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">{subtitle}</p>
              )}
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            {showSearch && (
              <div className="relative flex-1 min-w-0 max-w-xl">
                <ErpIcon
                  name="search"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                />
                <input
                  type="search"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full h-11 pl-10 pr-4 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[#2ec4f1]"
                  aria-label={searchPlaceholder}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {filters}
              {toolbarActions}
            </div>
          </div>
        </div>
      )}

      <div className={erpLayout.tableWrap}>
        <table className="w-full text-left text-xs sm:text-sm min-w-[640px]">
          <thead className={stickyHeader ? 'sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm' : ''}>
            <tr className="border-b border-slate-100">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${cellPad} ${erpTypography.label} text-slate-500 ${col.hideBelow ? hideClass[col.hideBelow] : ''} ${alignClass[col.align ?? 'left']} ${col.headerClassName ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading && (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center">
                  <div className="flex justify-center">
                    <Spinner />
                  </div>
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState title={emptyTitle} description={emptyDescription} icon="search" />
                </td>
              </tr>
            )}
            {!isLoading &&
              filtered.map((row, index) => (
                <tr key={rowKey(row, index)} className="hover:bg-slate-50/80 transition-colors">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`${cellPad} ${col.hideBelow ? hideClass[col.hideBelow] : ''} ${alignClass[col.align ?? 'left']} ${col.className ?? ''}`}
                    >
                      {col.render
                        ? col.render(row, index)
                        : col.accessor
                          ? col.accessor(row)
                          : null}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Barra de herramientas reutilizable para tablas / listados. */
export function DataTableToolbar({
  children,
  onToggleFilters,
  filtersOpen,
  onExport,
  onAdd,
  addLabel = 'Agregar',
}: {
  children?: React.ReactNode;
  onToggleFilters?: () => void;
  filtersOpen?: boolean;
  onExport?: () => void;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <>
      {onToggleFilters && (
        <Button
          variant={filtersOpen ? 'primary' : 'outline'}
          size="sm"
          leftIcon={<ErpIcon name="filter" />}
          onClick={onToggleFilters}
        >
          Filtros
        </Button>
      )}
      {onExport && (
        <Button variant="outline" size="sm" leftIcon={<ErpIcon name="export" />} onClick={onExport}>
          Exportar
        </Button>
      )}
      {onAdd && (
        <Button variant="primary" size="sm" leftIcon={<ErpIcon name="add" />} onClick={onAdd}>
          {addLabel}
        </Button>
      )}
      {children}
    </>
  );
}
