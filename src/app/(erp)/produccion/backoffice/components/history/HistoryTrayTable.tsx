'use client';

import React from 'react';
import { Database } from 'lucide-react';
import {
  HISTORY_TRAY_PAGE_SIZE,
  formatHistoryHourLabel,
  getHistoryHourKey,
  type HistoryUnitEntry,
} from '../../historyTrayUtils';
import type { CatalogAgency, CatalogBrand, CatalogModel, CatalogTech } from '../../types';
import { HistoryTrayPagination } from './HistoryTrayPagination';
import { HistoryTrayTableRow, type HistoryTrayRowActions } from './HistoryTrayTableRow';

type Props = HistoryTrayRowActions & {
  allEntries: HistoryUnitEntry[];
  emptyMessage?: string;
  historyPage: number;
  setHistoryPage: React.Dispatch<React.SetStateAction<number>>;
  historyLoadError: string | null;
  canReturnToPending: boolean;
  CAC_AGENCIES: CatalogAgency[];
  MASTER_TECNOLOGIAS: CatalogTech[];
  MASTER_MARCAS: CatalogBrand[];
  MASTER_MODELOS: CatalogModel[];
};

export function HistoryTrayTable({
  allEntries,
  emptyMessage = 'No hay ingresos CAC con orden de servicio TC-XXX que coincidan con los filtros',
  historyPage,
  setHistoryPage,
  historyLoadError,
  canReturnToPending,
  CAC_AGENCIES,
  MASTER_TECNOLOGIAS,
  MASTER_MARCAS,
  MASTER_MODELOS,
  onSapBlockReturn,
  onReturnToPending,
  onShowTimeline,
  onOpenHistoryModal,
  onOpenEditMeta,
  onPrintConduce,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(allEntries.length / HISTORY_TRAY_PAGE_SIZE));
  const safePage = Math.min(historyPage, totalPages);
  const pagedEntries = allEntries.slice(
    (safePage - 1) * HISTORY_TRAY_PAGE_SIZE,
    safePage * HISTORY_TRAY_PAGE_SIZE
  );
  const startItem = allEntries.length === 0 ? 0 : (safePage - 1) * HISTORY_TRAY_PAGE_SIZE + 1;
  const endItem = Math.min(safePage * HISTORY_TRAY_PAGE_SIZE, allEntries.length);

  let lastHourKey = '';

  const rows = pagedEntries.flatMap((entry, rowIdx) => {
    const hourKey = getHistoryHourKey(entry.classifiedAtIso);
    const hourRows: React.ReactNode[] = [];
    if (hourKey !== lastHourKey) {
      lastHourKey = hourKey;
      hourRows.push(
        <tr key={`hour-${hourKey}`} className="bg-[#2ec4f1]/10">
          <td colSpan={18} className="px-6 py-3 text-[10px] font-black uppercase tracking-[0.25em] text-[#181c3a]">
            {formatHistoryHourLabel(entry.classifiedAtIso)}
          </td>
        </tr>
      );
    }

    hourRows.push(
      <HistoryTrayTableRow
        key={`${entry.rec.id}-${entry.groupIndex}-${entry.unitIndex}`}
        entry={entry}
        rowIdx={rowIdx}
        canReturnToPending={canReturnToPending}
        CAC_AGENCIES={CAC_AGENCIES}
        MASTER_TECNOLOGIAS={MASTER_TECNOLOGIAS}
        MASTER_MARCAS={MASTER_MARCAS}
        MASTER_MODELOS={MASTER_MODELOS}
        onSapBlockReturn={onSapBlockReturn}
        onReturnToPending={onReturnToPending}
        onShowTimeline={onShowTimeline}
        onOpenHistoryModal={onOpenHistoryModal}
        onOpenEditMeta={onOpenEditMeta}
        onPrintConduce={onPrintConduce}
      />
    );
    return hourRows;
  });

  return (
    <>
      <div className="overflow-x-auto erp-table-wrap">
        <table className="w-full text-left min-w-[1400px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">Fecha / Hora</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">No. Guía</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">Piloto</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">Courier</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">Recibió</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">Estatus</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">Orden de Servicio</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">Ingreso</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">Agencia CAC</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">Tecnología</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">Marca</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">Modelo</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">Documento SAP</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">S-1</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">S-2</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">S-3</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500">S-4</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-slate-500 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {allEntries.length === 0 ? (
              <tr>
                <td colSpan={18} className="p-12 text-center">
                  <Database className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest max-w-lg mx-auto leading-relaxed">
                    {emptyMessage}
                  </p>
                </td>
              </tr>
            ) : (
              rows
            )}
          </tbody>
        </table>
      </div>

      <HistoryTrayPagination
        totalCount={allEntries.length}
        safePage={safePage}
        totalPages={totalPages}
        startItem={startItem}
        endItem={endItem}
        setHistoryPage={setHistoryPage}
      />
    </>
  );
}
