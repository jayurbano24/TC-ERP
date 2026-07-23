'use client';

import React, { memo } from 'react';
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

export const HistoryTrayTable = memo(function HistoryTrayTable({
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
        <tr key={`hour-${hourKey}`} className="bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]">
          <td colSpan={19} className="px-3 py-2 text-[9px] font-medium tracking-wider text-[var(--heading)] uppercase">
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
        onPrintConduce={onPrintConduce}
      />
    );
    return hourRows;
  });

  return (
    <>
      <div className="overflow-x-auto erp-table-wrap max-w-full">
        <table className="w-full text-left min-w-[1100px] table-auto">
          <thead>
            <tr className="bg-[var(--surface-hover)] border-b border-[var(--border)]">
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)]">Fecha</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)]">Guía</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)] hidden xl:table-cell">Piloto</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)] hidden xl:table-cell">Courier</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)] hidden 2xl:table-cell">Clasificó</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)]">Estatus</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)]">OS</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)]">Ingreso</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)]">Agencia</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)]">Tec.</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)] hidden 2xl:table-cell">Marca</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)]">Modelo</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)]">SAP</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)] hidden xl:table-cell">Val. SAP</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)]">S1</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)]">S2</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)]">S3</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)]">S4</th>
              <th className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap text-[var(--muted)] text-right sticky right-0 bg-[var(--surface-hover)]">Acc.</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-[var(--border)]">
                  {Array.from({ length: 19 }).map((__, j) => (
                    <td key={j} className="px-2 py-2">
                      <div className="h-3 bg-[var(--surface-hover)] rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : totalCount === 0 ? (
              <tr>
                <td colSpan={19} className="p-8 text-center">
                  <Database className="w-10 h-10 text-[var(--border)] mx-auto mb-3" />
                  <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider max-w-lg mx-auto leading-relaxed">
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
});
