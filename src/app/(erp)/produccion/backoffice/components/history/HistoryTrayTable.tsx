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
  pageEntries: HistoryUnitEntry[];
  totalCount: number;
  totalPages: number;
  loading?: boolean;
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
  pageEntries,
  totalCount,
  totalPages,
  loading = false,
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
  const safePage = Math.min(historyPage, totalPages);
  const startItem = totalCount === 0 ? 0 : (safePage - 1) * HISTORY_TRAY_PAGE_SIZE + 1;
  const endItem = Math.min(safePage * HISTORY_TRAY_PAGE_SIZE, totalCount);

  let lastHourKey = '';

  const rows = pageEntries.flatMap((entry, rowIdx) => {
    const hourKey = getHistoryHourKey(entry.classifiedAtIso);
    const hourRows: React.ReactNode[] = [];
    if (hourKey !== lastHourKey) {
      lastHourKey = hourKey;
      hourRows.push(
        <tr key={`hour-${hourKey}`} className="bg-[#2ec4f1]/10">
          <td colSpan={19} className="px-6 py-3 text-[10px] font-black uppercase tracking-[0.25em] text-[var(--heading)]">
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
            <tr className="bg-[var(--surface-hover)] border-b border-[var(--border)]">
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">Fecha / Hora</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">No. Guía</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">Piloto</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">Courier</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">Recibió</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">Estatus</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">Orden de Servicio</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">Ingreso</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">Agencia CAC</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">Tecnología</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">Marca</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">Modelo</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">Documento SAP</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">Validación SAP</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">S-1</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">S-2</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">S-3</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)]">S-4</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-[var(--muted)] text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-[var(--border)]">
                  {Array.from({ length: 19 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 bg-[var(--surface-hover)] rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : totalCount === 0 ? (
              <tr>
                <td colSpan={19} className="p-12 text-center">
                  <Database className="w-12 h-12 text-[var(--border)] mx-auto mb-4" />
                  <p className="text-xs font-black text-[var(--muted)] uppercase tracking-widest max-w-lg mx-auto leading-relaxed">
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
        totalCount={totalCount}
        safePage={safePage}
        totalPages={totalPages}
        startItem={startItem}
        endItem={endItem}
        setHistoryPage={setHistoryPage}
      />
    </>
  );
}
