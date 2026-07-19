"use client";

import React from 'react';
import { Badge } from '@/components/ui';
import { ErpIcon } from '@/lib/design/icons';
import { erpLayout, erpTypography } from '@/lib/design/tokens';
import Link from 'next/link';

interface ModulePageProps {
  title: string;
  subtitle?: string;
  category: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  backHref?: string;
}

/** Layout estándar de página ERP — responsive, sin animaciones pesadas. */
export const ModulePage = ({
  title,
  subtitle,
  category,
  actions,
  children,
  backHref,
}: ModulePageProps) => {
  return (
    <div className={`${erpLayout.page} py-4 sm:py-6`}>
      <header className={erpLayout.pageHeader}>
        <div className="space-y-2 sm:space-y-3 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {backHref && (
              <Link
                href={backHref}
                className="rounded-xl p-2 text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                aria-label="Volver"
              >
                <ErpIcon name="back" className="w-5 h-5" />
              </Link>
            )}
            <Badge variant="purple">{category}</Badge>
          </div>
          <h1 className={erpTypography.pageTitle}>{title}</h1>
          {subtitle && (
            <p className="text-sm sm:text-base text-[var(--muted)] font-medium max-w-3xl leading-relaxed">{subtitle}</p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">{actions}</div>
        )}
      </header>

      <main className="w-full min-w-0">{children}</main>
    </div>
  );
};

export const ModuleToolbar = ({
  onSearch,
  onAdd,
  addLabel = 'Agregar',
  searchPlaceholder = 'Buscar registros...',
  filters,
  onFilter,
  onExport,
  searchValue,
}: {
  onSearch?: (val: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  onFilter?: () => void;
  onExport?: () => void;
  searchValue?: string;
}) => {
  return (
    <div
      className="mb-6 flex flex-col items-stretch gap-3 rounded-2xl border border-[var(--border)] p-3 sm:mb-8 sm:p-4 lg:flex-row lg:items-center"
      style={{ backgroundColor: 'var(--surface)', color: 'var(--foreground)' }}
    >
      {onSearch && (
        <div className="relative min-w-0 flex-1">
          <ErpIcon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearch(e.target.value)}
            className="h-11 w-full rounded-xl border-2 border-[var(--border)] pr-4 pl-10 text-sm font-semibold text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] sm:h-12"
            style={{ backgroundColor: 'var(--surface-hover)' }}
            aria-label={searchPlaceholder}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {filters}
        {onFilter && (
          <button
            type="button"
            onClick={onFilter}
            className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--border)] px-4 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
          >
            <ErpIcon name="filter" /> Filtros
          </button>
        )}
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--border)] px-4 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
          >
            <ErpIcon name="export" /> Exportar
          </button>
        )}
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <ErpIcon name="add" /> {addLabel}
          </button>
        )}
      </div>
    </div>
  );
};
