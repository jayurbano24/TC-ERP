'use client';

import type React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  totalCount: number;
  page: number;
  totalPages: number;
  startItem: number;
  endItem: number;
  pageSize: number;
  onPageChange: React.Dispatch<React.SetStateAction<number>>;
  itemLabel?: string;
};

export function TablePagination({
  totalCount,
  page,
  totalPages,
  startItem,
  endItem,
  pageSize,
  onPageChange,
  itemLabel = 'registros',
}: Props) {
  if (totalCount === 0) return null;

  const pageButtons = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
    .reduce<(number | 'gap')[]>((acc, p, idx, arr) => {
      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('gap');
      acc.push(p);
      return acc;
    }, []);

  return (
    <div className="bg-slate-50/50 p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Mostrando{' '}
          <span className="text-[#181c3a]">
            {startItem}-{endItem}
          </span>{' '}
          de <span className="text-[#181c3a]">{totalCount}</span> {itemLabel}
        </span>
        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
          {pageSize} por página · Hoja {page} de {totalPages}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-400 hover:bg-[#181c3a] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title="Primera página"
        >
          «
        </button>
        <button
          type="button"
          onClick={() => onPageChange((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-[#181c3a] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title="Página anterior"
        >
          <ChevronLeft size={14} />
        </button>
        {pageButtons.map((p, idx) =>
          p === 'gap' ? (
            <span
              key={`gap-${idx}`}
              className="w-8 h-8 flex items-center justify-center text-[10px] font-black text-slate-300"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p as number)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black transition-all ${
                page === p ? 'bg-[#181c3a] text-white shadow-sm' : 'text-slate-400 hover:bg-slate-100'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPageChange((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-[#181c3a] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title="Siguiente página"
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-400 hover:bg-[#181c3a] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title="Última página"
        >
          »
        </button>
      </div>
    </div>
  );
}
