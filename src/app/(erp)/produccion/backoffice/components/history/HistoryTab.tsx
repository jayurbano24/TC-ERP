'use client';

import { useCallback } from 'react';
import { Button, Card } from '@/components/ui';
import type { CacTrayStatsResponse } from '@/lib/backoffice/cacTrayTypes';
import { ChevronDown, Filter, RefreshCw } from 'lucide-react';
import { hasActiveHistoryTrayFilters, type HistoryTrayFilters, type HistoryUnitEntry } from '../../historyTrayUtils';
import type { CatalogAgency, CatalogBrand, CatalogModel, CatalogTech } from '../../types';
import { HistoryFiltersPanel } from './HistoryFiltersPanel';
import { HistorySearchInput } from './HistorySearchInput';
import { HistoryStatsGrid } from './HistoryStatsGrid';
import { HistoryToolbar } from './HistoryToolbar';
import { HistoryTrayTable } from './HistoryTrayTable';

type Props = {
  historyLoadError: string | null;
  historyLoading: boolean;
  historyStatsLoading?: boolean;
  historyStats: CacTrayStatsResponse;
  totalCount: number;
  totalPages: number;
  historySearch: string;
  setHistorySearch: (value: string) => void;
  historyFilters: HistoryTrayFilters;
  historyFiltersOpen: boolean;
  setHistoryFiltersOpen: React.Dispatch<React.SetStateAction<boolean>>;
  historyPage: number;
  setHistoryPage: React.Dispatch<React.SetStateAction<number>>;
  fetchHistory: (opts?: { silent?: boolean }) => Promise<void>;
  getHistoryTrayEntries: () => HistoryUnitEntry[];
  historyFilterBrands: CatalogBrand[];
  historyFilterModels: CatalogModel[];
  patchHistoryFilter: (patch: Partial<HistoryTrayFilters>) => void;
  clearHistoryFilters: () => void;
  dateFilterFrom: string;
  dateFilterTo: string;
  setDateFilterFrom: (value: string) => void;
  setDateFilterTo: (value: string) => void;
  CAC_AGENCIES: CatalogAgency[];
  MASTER_TECNOLOGIAS: CatalogTech[];
  MASTER_MARCAS: CatalogBrand[];
  MASTER_MODELOS: CatalogModel[];
  canReturnToPending: boolean;
  onExportReport: (opts?: { allData?: boolean }) => void;
  onOpenMassTransfer: () => void;
  onSapBlockReturn: (entry: HistoryUnitEntry) => void;
  onReturnToPending: (receptionId: string) => void;
  onShowTimeline: (rec: unknown) => void;
  onOpenHistoryModal: (rec: unknown) => void;
  onPrintConduce: (rec: unknown) => void;
};

export function HistoryTab({
  historyLoadError,
  historyLoading,
  historyStatsLoading = false,
  historyStats,
  totalCount,
  totalPages,
  historySearch,
  setHistorySearch,
  historyFilters,
  historyFiltersOpen,
  setHistoryFiltersOpen,
  historyPage,
  setHistoryPage,
  fetchHistory,
  getHistoryTrayEntries,
  historyFilterBrands,
  historyFilterModels,
  patchHistoryFilter,
  clearHistoryFilters,
  dateFilterFrom,
  dateFilterTo,
  setDateFilterFrom,
  setDateFilterTo,
  CAC_AGENCIES,
  MASTER_TECNOLOGIAS,
  MASTER_MARCAS,
  MASTER_MODELOS,
  canReturnToPending,
  onExportReport,
  onOpenMassTransfer,
  onSapBlockReturn,
  onReturnToPending,
  onShowTimeline,
  onOpenHistoryModal,
  onPrintConduce,
}: Props) {
  const trayEntries = getHistoryTrayEntries();
  const onSearchChange = useCallback(
    (value: string) => {
      setHistorySearch(value);
      setHistoryPage(1);
    },
    [setHistorySearch, setHistoryPage],
  );
  const hasUserFilters =
    Boolean(historySearch.trim() || dateFilterFrom || dateFilterTo || hasActiveHistoryTrayFilters(historyFilters));

  const emptyMessage = historyLoadError
    ? 'No se pudo cargar el historial. Use Reintentar arriba.'
    : totalCount === 0 && !hasUserFilters
      ? 'No hay equipos CAC clasificados con orden TC-XXX. Procese recepciones desde Bandeja de Entrada.'
      : hasUserFilters && trayEntries.length === 0
        ? 'Ningún registro coincide con los filtros activos. Limpie búsqueda, fechas o filtros por columna.'
        : 'No hay ingresos CAC con orden de servicio TC-XXX que coincidan con los filtros';

  const showInitialLoader = historyLoading && trayEntries.length === 0 && !historyLoadError;
  const showTableLoading = historyLoading && trayEntries.length === 0 && !historyLoadError;

  return (
    <div className="space-y-4">
      {historyLoadError && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">Error al cargar el historial</p>
            <p className="text-xs font-bold text-amber-700 mt-1">{historyLoadError}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => fetchHistory()}
            className="font-black text-[10px] uppercase border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0"
          >
            <RefreshCw size={14} className="mr-2" /> Reintentar
          </Button>
        </div>
      )}

      <>
          <HistoryStatsGrid
            stats={historyStats}
            loading={historyStatsLoading || showInitialLoader}
            MASTER_TECNOLOGIAS={MASTER_TECNOLOGIAS}
          />

          <HistoryToolbar
            entryCount={totalCount}
            dateFilterFrom={dateFilterFrom}
            dateFilterTo={dateFilterTo}
            onDateFromChange={(v) => {
              setDateFilterFrom(v);
              setHistoryPage(1);
            }}
            onDateToChange={(v) => {
              setDateFilterTo(v);
              setHistoryPage(1);
            }}
            onExportReport={onExportReport}
            onOpenMassTransfer={onOpenMassTransfer}
          />

          <Card className="p-0 erp-themed-surface rounded-2xl shadow-lg border border-[var(--border)] overflow-hidden transition-all duration-500">
            <div className="p-3 sm:p-4 border-b border-[var(--border)] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <HistorySearchInput value={historySearch} onChange={onSearchChange} />
                <button
                  type="button"
                  onClick={() => setHistoryFiltersOpen((o) => !o)}
                  className={`flex items-center gap-2 h-10 px-4 rounded-xl text-[9px] font-medium uppercase tracking-wider border transition-all shrink-0 ${
                    historyFiltersOpen || hasActiveHistoryTrayFilters(historyFilters)
                      ? 'border-[var(--heading)] bg-[var(--heading)] text-white'
                      : 'border-[var(--border)] bg-[var(--surface-hover)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <Filter size={14} />
                  Filtros
                  {hasActiveHistoryTrayFilters(historyFilters) && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-[var(--heading)] text-[8px]">on</span>
                  )}
                  <ChevronDown size={12} className={`transition-transform ${historyFiltersOpen ? 'rotate-180' : ''}`} />
                </button>
                {hasActiveHistoryTrayFilters(historyFilters) && (
                  <button
                    type="button"
                    onClick={clearHistoryFilters}
                    className="h-10 px-3 rounded-xl text-[9px] font-medium uppercase tracking-wider text-rose-500 border border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all shrink-0"
                  >
                    Limpiar
                  </button>
                )}
              </div>

              {historyFiltersOpen && (
                <HistoryFiltersPanel
                  historyFilters={historyFilters}
                  patchHistoryFilter={patchHistoryFilter}
                  MASTER_TECNOLOGIAS={MASTER_TECNOLOGIAS}
                  historyFilterBrands={historyFilterBrands}
                  historyFilterModels={historyFilterModels}
                  CAC_AGENCIES={CAC_AGENCIES}
                />
              )}
            </div>

            <HistoryTrayTable
              pageEntries={trayEntries}
              totalCount={totalCount}
              totalPages={totalPages}
              loading={showTableLoading}
              emptyMessage={emptyMessage}
              historyPage={historyPage}
              setHistoryPage={setHistoryPage}
              historyLoadError={historyLoadError}
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
          </Card>
        </>
    </div>
  );
}
