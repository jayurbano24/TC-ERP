'use client';

import { Button, Card } from '@/components/ui';
import { ChevronDown, Filter, RefreshCw, Search } from 'lucide-react';
import {
  findOrphanClassifications,
  hasActiveHistoryTrayFilters,
  type HistoryTrayFilters,
  type HistoryUnitEntry,
} from '../../historyTrayUtils';
import type { CatalogAgency, CatalogBrand, CatalogModel, CatalogTech } from '../../types';
import { HistoryFiltersPanel } from './HistoryFiltersPanel';
import { HistoryStatsGrid } from './HistoryStatsGrid';
import { HistoryToolbar } from './HistoryToolbar';
import { HistoryTrayTable } from './HistoryTrayTable';

type Props = {
  historyLoadError: string | null;
  historyLoading: boolean;
  historyReceptions: unknown[];
  historySearch: string;
  setHistorySearch: (value: string) => void;
  historyFilters: HistoryTrayFilters;
  historyFiltersOpen: boolean;
  setHistoryFiltersOpen: React.Dispatch<React.SetStateAction<boolean>>;
  historyPage: number;
  setHistoryPage: React.Dispatch<React.SetStateAction<number>>;
  fetchHistory: (opts?: { silent?: boolean }) => Promise<void>;
  getHistoryTrayEntries: () => HistoryUnitEntry[];
  getUnfilteredHistoryTrayEntries: () => HistoryUnitEntry[];
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
  onExportReport: () => void;
  onOpenMassTransfer: () => void;
  onSapBlockReturn: (entry: HistoryUnitEntry) => void;
  onReturnToPending: (receptionId: string) => void;
  onShowTimeline: (rec: unknown) => void;
  onOpenHistoryModal: (rec: unknown) => void;
  onOpenEditMeta: (rec: unknown) => void;
  onPrintConduce: (rec: unknown) => void;
};

export function HistoryTab({
  historyLoadError,
  historyLoading,
  historyReceptions,
  historySearch,
  setHistorySearch,
  historyFilters,
  historyFiltersOpen,
  setHistoryFiltersOpen,
  historyPage,
  setHistoryPage,
  fetchHistory,
  getHistoryTrayEntries,
  getUnfilteredHistoryTrayEntries,
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
  onOpenEditMeta,
  onPrintConduce,
}: Props) {
  const trayEntries = getHistoryTrayEntries();
  const totalTcEntries = getUnfilteredHistoryTrayEntries();
  const hasUserFilters =
    Boolean(historySearch.trim() || dateFilterFrom || dateFilterTo || hasActiveHistoryTrayFilters(historyFilters));

  const emptyMessage = historyLoadError
    ? 'No se pudo cargar el historial. Use Reintentar arriba.'
    : totalTcEntries.length === 0
      ? 'No hay equipos CAC clasificados con orden TC-XXX. Procese recepciones desde Bandeja de Entrada.'
      : hasUserFilters && trayEntries.length === 0
        ? 'Ningún registro coincide con los filtros activos. Limpie búsqueda, fechas o filtros por columna.'
        : 'No hay ingresos CAC con orden de servicio TC-XXX que coincidan con los filtros';
  const orphans =
    historySearch.trim() && trayEntries.length === 0
      ? findOrphanClassifications(historyReceptions as Parameters<typeof findOrphanClassifications>[0], historySearch)
      : [];

  const showInitialLoader = historyLoading && historyReceptions.length === 0 && !historyLoadError;

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

      {showInitialLoader && (
        <div className="py-16 text-center bg-white rounded-2xl border border-slate-100">
          <RefreshCw className="w-10 h-10 mx-auto mb-4 text-[#2ec4f1] animate-spin" />
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Cargando historial...</p>
        </div>
      )}

      {!showInitialLoader && (
        <>
      <HistoryStatsGrid
        trayEntries={trayEntries}
        MASTER_TECNOLOGIAS={MASTER_TECNOLOGIAS}
        MASTER_MODELOS={MASTER_MODELOS}
      />

      <HistoryToolbar
        entryCount={trayEntries.length}
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

      <Card className="p-0 bg-white rounded-[2.5rem] shadow-2xl border-none overflow-hidden transition-all duration-500">
        <div className="p-8 border-b border-slate-50 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="relative group flex-1 max-w-xl">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-[#2ec4f1] transition-colors" />
              <input
                type="text"
                placeholder="BUSCAR POR SERIE, GUÍA COURIER O DOCUMENTO SAP..."
                className="w-full h-14 pl-16 pr-6 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-[10px] text-[#181c3a] outline-none focus:border-[#2ec4f1] focus:bg-white transition-all uppercase tracking-widest"
                value={historySearch}
                onChange={(e) => {
                  setHistorySearch(e.target.value);
                  setHistoryPage(1);
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setHistoryFiltersOpen((o) => !o)}
              className={`flex items-center gap-2 h-14 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                historyFiltersOpen || hasActiveHistoryTrayFilters(historyFilters)
                  ? 'border-[#181c3a] bg-[#181c3a] text-white'
                  : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-[#2ec4f1]'
              }`}
            >
              <Filter size={16} />
              Filtros por columna
              {hasActiveHistoryTrayFilters(historyFilters) && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-[#2ec4f1] text-[#181c3a] text-[8px]">activos</span>
              )}
              <ChevronDown size={14} className={`transition-transform ${historyFiltersOpen ? 'rotate-180' : ''}`} />
            </button>
            {hasActiveHistoryTrayFilters(historyFilters) && (
              <button
                type="button"
                onClick={clearHistoryFilters}
                className="h-14 px-5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-rose-500 border-2 border-rose-100 hover:bg-rose-50 transition-all"
              >
                Limpiar filtros
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

        {orphans.length > 0 && (
          <div className="mx-8 mt-6 mb-2 rounded-2xl border-2 border-amber-200 bg-amber-50 px-6 py-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-900">
              Ingreso incompleto — hay trazabilidad en notas pero sin orden de servicio TC-XXX
            </p>
            <p className="text-[10px] font-bold text-amber-800 mt-2 leading-relaxed">
              Guía(s): {orphans.map((r) => r.guide_number).join(', ')}. Estado: {orphans[0]?.status}. Vuelva a{' '}
              <strong>Bandeja de Entrada</strong>, reprocese la guía y confirme el mensaje &quot;✅ X equipo(s)
              registrado(s)&quot; al finalizar.
            </p>
          </div>
        )}

        <HistoryTrayTable
          allEntries={trayEntries}
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
          onOpenEditMeta={onOpenEditMeta}
          onPrintConduce={onPrintConduce}
        />
      </Card>
        </>
      )}
    </div>
  );
}
