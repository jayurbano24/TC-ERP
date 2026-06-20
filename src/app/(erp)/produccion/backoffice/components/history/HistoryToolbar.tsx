'use client';

import { Download, Stethoscope } from 'lucide-react';
import { HISTORY_TRAY_PAGE_SIZE } from '../../historyTrayUtils';

type Props = {
  entryCount: number;
  dateFilterFrom: string;
  dateFilterTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onExportReport: () => void;
  onOpenMassTransfer: () => void;
};

export function HistoryToolbar({
  entryCount,
  dateFilterFrom,
  dateFilterTo,
  onDateFromChange,
  onDateToChange,
  onExportReport,
  onOpenMassTransfer,
}: Props) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-2 mb-10">
      <div className="flex flex-col">
        <h2 className="text-xl font-black text-[#181c3a] uppercase tracking-tight">
          Bandeja de Historial Global — CAC
        </h2>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-2">
          {entryCount} equipos con OS TC-XXX · máx. {HISTORY_TRAY_PAGE_SIZE} por página · más recientes primero
        </p>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-4 bg-white p-2.5 rounded-3xl border border-slate-100 shadow-sm px-6">
          <div className="flex flex-col">
            <label className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-0.5">Desde</label>
            <input
              type="date"
              className="text-[11px] font-bold text-[#181c3a] outline-none cursor-pointer"
              value={dateFilterFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
            />
          </div>
          <div className="w-[1px] h-8 bg-slate-100" />
          <div className="flex flex-col">
            <label className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-0.5">Hasta</label>
            <input
              type="date"
              className="text-[11px] font-bold text-[#181c3a] outline-none cursor-pointer"
              value={dateFilterTo}
              onChange={(e) => onDateToChange(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onExportReport}
            className="flex items-center gap-3 px-8 h-16 bg-[#2ec4f1] text-[#181c3a] rounded-3xl text-[10px] font-black uppercase tracking-widest hover:bg-[#181c3a] hover:text-white transition-all shadow-xl shadow-[#2ec4f1]/20 active:scale-95"
          >
            <Download size={16} /> Generar Reporte
          </button>
          <button
            type="button"
            onClick={onOpenMassTransfer}
            className="flex items-center gap-3 px-8 h-16 bg-amber-500 text-white rounded-3xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all shadow-xl shadow-amber-500/20 active:scale-95"
          >
            <Stethoscope size={16} /> Trasladar a Taller
          </button>
        </div>
      </div>
    </div>
  );
}
