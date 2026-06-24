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
                className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-900"
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
    <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 mb-6 sm:mb-8 bg-[var(--surface)] p-3 sm:p-4 rounded-2xl border border-[var(--border)]">
      {onSearch && (
        <div className="relative flex-1 min-w-0">
          <ErpIcon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
          />
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full h-11 sm:h-12 pl-10 pr-4 bg-slate-50 rounded-xl text-sm font-bold outline-none border-2 border-transparent focus:border-[#2ec4f1] transition-colors"
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
            className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <ErpIcon name="filter" /> Filtros
          </button>
        )}
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <ErpIcon name="export" /> Exportar
          </button>
        )}
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-[#181c3a] text-white text-sm font-bold hover:bg-[#252b57]"
          >
            <ErpIcon name="add" /> {addLabel}
          </button>
        )}
      </div>
    </div>
  );
};
