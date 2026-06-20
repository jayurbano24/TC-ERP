'use client';

import type React from 'react';
import { HISTORY_TRAY_PAGE_SIZE } from '../../historyTrayUtils';

type Props = {
  totalCount: number;
  safePage: number;
  totalPages: number;
  startItem: number;
  endItem: number;
  setHistoryPage: React.Dispatch<React.SetStateAction<number>>;
};

export function HistoryTrayPagination({ totalCount, safePage, totalPages, startItem, endItem, setHistoryPage }: Props) {
  if (totalCount === 0) return null;
  const pageButtons = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
    .reduce<(number | 'gap')[]>((acc, p, idx, arr) => {
      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('gap');
      acc.push(p);
      return acc;
    }, []);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-8 py-5 border-t border-slate-100">
      <div className="flex items-center gap-6">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Mostrando <span className="text-[#181c3a]">{startItem}-{endItem}</span> de <span className="text-[#181c3a]">{totalCount}</span> equipos CAC (TC-XXX)
        </p>
        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{HISTORY_TRAY_PAGE_SIZE} por pagina</p>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setHistoryPage(1)} disabled={safePage === 1} className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black text-slate-400 hover:bg-[#181c3a] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all" title="Primera pagina">«</button>
        <button type="button" onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black text-slate-400 hover:bg-[#181c3a] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all" title="Pagina anterior">‹</button>
        {pageButtons.map((p, idx) => p === 'gap' ? (
          <span key={`gap-${idx}`} className="w-8 h-8 flex items-center justify-center text-[10px] font-black text-slate-300">…</span>
        ) : (
          <button key={p} type="button" onClick={() => setHistoryPage(p as number)} className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black transition-all ${safePage === p ? 'bg-[#181c3a] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-100'}`}>{p}</button>
        ))}
        <button type="button" onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black text-slate-400 hover:bg-[#181c3a] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all" title="Siguiente pagina">›</button>
        <button type="button" onClick={() => setHistoryPage(totalPages)} disabled={safePage === totalPages} className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black text-slate-400 hover:bg-[#181c3a] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all" title="Ultima pagina">»</button>
      </div>
    </div>
  );
}
