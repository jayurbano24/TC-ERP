'use client';

import { memo, useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui';
import { Plus, Activity, Edit3, Trash2, Save, FileUp, FileDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { WORKSHOP_CATALOG_PAGE_SIZE } from '../utils/workshopCatalogCsv';

export type CatalogColumn = {
  header: string;
  align?: 'left' | 'right';
  cell: (item: any) => React.ReactNode;
};

type Props = {
  type: string;
  title: string;
  subtitle: string;
  addLabel: string;
  icon: React.ReactNode;
  iconWrapClassName: string;
  theme: 'light' | 'dark';
  data: any[];
  columns: CatalogColumn[];
  idField?: string;
  loading?: boolean;
  emptyIcon?: React.ReactNode;
  emptyText: string;
  compact?: boolean;
  metaHint?: string;
  pageSize?: number;
  paginationLabel?: string;
  onExport?: () => void;
  onImport?: (file: File) => void | Promise<void>;
  onOpenModal: (type: string, item?: any) => void;
  onQuickSave?: (type: string, item: any) => void | Promise<void>;
  onDelete: (type: string, id: string) => void;
};

export const CatalogTableView = memo(function CatalogTableView({
  type,
  title,
  subtitle,
  addLabel,
  icon,
  iconWrapClassName,
  theme,
  data,
  columns,
  idField = 'id',
  loading,
  emptyIcon,
  emptyText,
  compact = false,
  metaHint,
  pageSize = WORKSHOP_CATALOG_PAGE_SIZE,
  paginationLabel = 'registros',
  onExport,
  onImport,
  onOpenModal,
  onQuickSave,
  onDelete,
}: Props) {
  const importInputId = useId().replace(/:/g, '');
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = Math.min(Math.max(pageSize, 1), WORKSHOP_CATALOG_PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [data.length, type]);

  const totalPages = Math.max(1, Math.ceil(data.length / perPage));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedData = useMemo(() => {
    const start = (safePage - 1) * perPage;
    return data.slice(start, start + perPage);
  }, [data, safePage, perPage]);

  const rangeStart = data.length === 0 ? 0 : (safePage - 1) * perPage + 1;
  const rangeEnd = Math.min(safePage * perPage, data.length);

  const isDark = theme === 'dark';
  const headPad = compact ? 'px-3 py-2' : 'px-8 py-5';
  const cellPad = compact ? 'px-3 py-2' : 'px-8 py-5';
  const headerPad = compact ? 'p-4' : 'p-8';
  const showPager = data.length > perPage;
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set<number>([1, totalPages, safePage, safePage - 1, safePage + 1]);
    return [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  }, [totalPages, safePage]);

  const handleImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file && onImport) await onImport(file);
  };

  return (
    <div className={`animate-rise-in ${compact ? 'space-y-3' : 'space-y-6'}`}>
      <div
        className={
          isDark
            ? `flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[#181c3a] ${headerPad} rounded-2xl shadow-xl`
            : `flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white ${headerPad} rounded-2xl border-2 border-slate-100 shadow-sm`
        }
      >
        <div className={`flex items-center gap-3 min-w-0${isDark ? ' text-white' : ''}`}>
          <div className={iconWrapClassName}>{icon}</div>
          <div className="min-w-0">
            <h3 className={`${compact ? 'text-lg' : 'text-xl'} font-black${isDark ? '' : ' text-[#181c3a]'}`}>{title}</h3>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-white/40' : 'text-slate-400'}`}>{subtitle}</p>
            {metaHint ? (
              <p className={`mt-0.5 text-[10px] font-semibold ${isDark ? 'text-amber-300/90' : 'text-amber-700'}`}>{metaHint}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onImport ? (
            <>
              <input
                type="file"
                id={importInputId}
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportChange}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById(importInputId)?.click()}
                className={`font-black text-[9px] uppercase tracking-widest ${isDark ? 'border-white/20 text-white/80 hover:bg-white/10' : 'border-slate-200 text-slate-600'}`}
                leftIcon={<FileUp className="w-3.5 h-3.5" />}
              >
                Importar Excel
              </Button>
            </>
          ) : null}
          {onExport ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              className={`font-black text-[9px] uppercase tracking-widest ${isDark ? 'border-white/20 text-white/80 hover:bg-white/10' : 'border-slate-200 text-slate-600'}`}
              leftIcon={<FileDown className="w-3.5 h-3.5" />}
            >
              Exportar Excel
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            onClick={() => onOpenModal(type)}
            className={isDark ? 'bg-[#2ec4f1] text-[#181c3a]' : 'bg-[#181c3a] text-white shadow-xl shadow-[#181c3a]/20'}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            {addLabel}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm overflow-x-auto">
        {loading ? (
          <div className={`text-center ${compact ? 'py-10' : 'py-20'}`}>
            <Activity className="w-10 h-10 animate-spin mx-auto text-[#2ec4f1] mb-4" />
            <p className="text-[10px] font-black uppercase text-slate-400">Sincronizando con la nube...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="py-20 text-center opacity-20">
            {emptyIcon}
            <p className="text-[10px] font-black uppercase tracking-widest">{emptyText}</p>
          </div>
        ) : (
          <>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  {columns.map((col, i) => (
                    <th
                      key={i}
                      className={`${headPad} text-[9px] font-black uppercase tracking-widest text-slate-400${col.align === 'right' ? ' text-right' : ''}`}
                    >
                      {col.header}
                    </th>
                  ))}
                  <th className={`${headPad} text-[9px] font-black uppercase tracking-widest text-slate-400 text-right ${onQuickSave ? 'w-[112px]' : 'w-[88px]'}`}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedData.map((item) => (
                  <tr key={item[idField]} className="hover:bg-slate-50/80 transition-colors">
                    {columns.map((col, i) => (
                      <td key={i} className={`${cellPad}${col.align === 'right' ? ' text-right' : ''}`}>
                        {col.cell(item)}
                      </td>
                    ))}
                    <td className={`${cellPad} text-right`}>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => onOpenModal(type, item)}
                          className={`text-slate-400 hover:text-[#181c3a] rounded-lg transition-all ${compact ? 'p-1' : 'p-2'}`}
                        >
                          <Edit3 size={compact ? 14 : 16} />
                        </button>
                        {onQuickSave ? (
                          <button
                            type="button"
                            title="Guardar"
                            onClick={() => void onQuickSave(type, item)}
                            className={`text-slate-400 hover:text-emerald-600 rounded-lg transition-all ${compact ? 'p-1' : 'p-2'}`}
                          >
                            <Save size={compact ? 14 : 16} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          title="Eliminar"
                          onClick={() => onDelete(type, item[idField])}
                          className={`text-slate-400 hover:text-rose-500 rounded-lg transition-all ${compact ? 'p-1' : 'p-2'}`}
                        >
                          <Trash2 size={compact ? 14 : 16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {rangeStart}–{rangeEnd} de {data.length} {paginationLabel}
                {showPager ? ` · ${perPage} / pág.` : ''}
              </p>
              {showPager ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  {pageNumbers.map((page, idx) => {
                    const prev = pageNumbers[idx - 1];
                    const gap = prev != null && page - prev > 1;
                    return (
                      <span key={page} className="flex items-center gap-1">
                        {gap ? <span className="px-1 text-slate-300">…</span> : null}
                        <button
                          type="button"
                          onClick={() => setCurrentPage(page)}
                          className={`min-w-[2rem] rounded-lg px-2 py-1 text-xs font-black ${
                            safePage === page
                              ? 'bg-[#181c3a] text-white'
                              : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          {page}
                        </button>
                      </span>
                    );
                  })}
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                    aria-label="Página siguiente"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
