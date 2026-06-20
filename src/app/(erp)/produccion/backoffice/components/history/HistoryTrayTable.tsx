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
      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[1400px]">
          <thead>
            <tr className="bg-[#181c3a] text-white">
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Fecha / Hora</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">No. Guía</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Piloto</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Courier</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Recibió</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Estatus</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Orden de Servicio</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Ingreso</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Agencia CAC</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Tecnología</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Marca</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Modelo</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Documento SAP</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">S-1</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">S-2</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">S-3</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">S-4</th>
              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {allEntries.length === 0 ? (
              <tr>
                <td colSpan={18} className="p-12 text-center">
                  <Database className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    {historyLoadError
                      ? 'No se pudo cargar el historial. Use Reintentar arriba.'
                      : 'No hay ingresos CAC con orden de servicio TC-XXX que coincidan con los filtros'}
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
