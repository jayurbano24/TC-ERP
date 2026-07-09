'use client';

import { useState } from 'react';
import { Download, Stethoscope } from 'lucide-react';
import { HISTORY_TRAY_PAGE_SIZE } from '../../historyTrayUtils';

type Props = {
  entryCount: number;
  dateFilterFrom: string;
  dateFilterTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onExportReport: (opts?: { allData?: boolean }) => void;
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
  const [exportAllData, setExportAllData] = useState(false);

  return (
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 px-1 mb-4">
      <div className="min-w-0">
        <h2 className="text-base sm:text-lg font-semibold text-[var(--heading)] uppercase tracking-tight truncate">
          Bandeja de Historial Global — CAC
        </h2>
        <p className="text-[9px] font-medium uppercase tracking-wider text-[var(--muted)] mt-0.5">
          {entryCount} equipos · máx. {HISTORY_TRAY_PAGE_SIZE}/página
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div
          className={`flex items-center gap-3 bg-[var(--surface)] text-[var(--foreground)] p-1.5 rounded-2xl border border-[var(--border)] shadow-sm px-3 ${
            exportAllData ? 'opacity-50' : ''
          }`}
        >
          <div className="flex flex-col">
            <label className="text-[7px] font-medium text-[var(--muted)] uppercase tracking-wider mb-0.5">Desde</label>
            <input
              type="date"
              disabled={exportAllData}
              className="text-[11px] font-medium text-[var(--foreground)] bg-transparent outline-none cursor-pointer disabled:cursor-not-allowed"
              value={dateFilterFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
            />
          </div>
          <div className="w-px h-7 bg-[var(--border)]" />
          <div className="flex flex-col">
            <label className="text-[7px] font-medium text-[var(--muted)] uppercase tracking-wider mb-0.5">Hasta</label>
            <input
              type="date"
              disabled={exportAllData}
              className="text-[11px] font-medium text-[var(--foreground)] bg-transparent outline-none cursor-pointer disabled:cursor-not-allowed"
              value={dateFilterTo}
              onChange={(e) => onDateToChange(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 h-11 px-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] cursor-pointer select-none shadow-sm">
          <input
            type="checkbox"
            className="w-3.5 h-3.5 rounded border-[var(--border)] text-[#2ec4f1] focus:ring-[#2ec4f1]"
            checked={exportAllData}
            onChange={(e) => setExportAllData(e.target.checked)}
          />
          <span className="text-[9px] font-medium uppercase tracking-wider whitespace-nowrap">
            Todos los datos
          </span>
        </label>

        <button
          type="button"
          onClick={() => onExportReport({ allData: exportAllData })}
          className="flex items-center gap-2 px-4 h-11 bg-[#2ec4f1] text-[#181c3a] rounded-2xl text-[9px] font-semibold uppercase tracking-wider hover:bg-[#181c3a] hover:text-white transition-all shadow-md active:scale-95"
        >
          <Download size={14} /> Generar Reporte
        </button>
        <button
          type="button"
          onClick={onOpenMassTransfer}
          className="flex items-center gap-2 px-4 h-11 bg-amber-500 text-[#181c3a] rounded-2xl text-[9px] font-semibold uppercase tracking-wider hover:bg-amber-600 transition-all shadow-md active:scale-95"
        >
          <Stethoscope size={14} /> Trasladar a Taller
        </button>
      </div>
    </div>
  );
}
