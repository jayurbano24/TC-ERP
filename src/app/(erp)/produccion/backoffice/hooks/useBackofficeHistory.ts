'use client';

import { useCallback, useRef, useState } from 'react';
import { getReceptionsWithSeries } from '@/lib/database/receptions';
import {
  collectTcHistoryUnitEntries,
  filterUnitEntriesByDate,
  filterUnitEntriesBySearch,
  filterUnitEntriesByTrayFilters,
  EMPTY_HISTORY_TRAY_FILTERS,
  type HistoryTrayFilters,
} from '../historyTrayUtils';
import { filterEquipmentHistoryReceptions } from '../history/filterEquipmentHistoryReceptions';
import type { CatalogAgency, CatalogBrand, CatalogModel } from '../types';

type Catalogs = {
  CAC_AGENCIES: CatalogAgency[];
  MASTER_MARCAS: CatalogBrand[];
  MASTER_MODELOS: CatalogModel[];
  resolveSeriesPerUnit: (modelId: string) => number;
};

export function useBackofficeHistory(
  catalogs: Catalogs,
  dateFilterFrom: string,
  dateFilterTo: string
) {
  const historyFetchIdRef = useRef(0);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyReceptions, setHistoryReceptions] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilters, setHistoryFilters] = useState<HistoryTrayFilters>(EMPTY_HISTORY_TRAY_FILTERS);
  const [historyFiltersOpen, setHistoryFiltersOpen] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);

  const fetchHistory = useCallback(async (opts?: { silent?: boolean }) => {
    const fetchId = ++historyFetchIdRef.current;
    if (!opts?.silent) setHistoryLoading(true);
    setHistoryLoadError(null);
    try {
      const data = await getReceptionsWithSeries('cac');
      if (fetchId !== historyFetchIdRef.current) return;
      setHistoryReceptions(filterEquipmentHistoryReceptions(data));
      setHistoryPage(1);
      setHistoryLoadError(null);
    } catch (error: any) {
      if (fetchId !== historyFetchIdRef.current) return;
      console.error('Error fetching history with series:', error);
      setHistoryLoadError(error?.message || 'No se pudo cargar el historial.');
    } finally {
      if (fetchId === historyFetchIdRef.current) setHistoryLoading(false);
    }
  }, []);

  const collectHistoryTrayEntries = useCallback(
    () => collectTcHistoryUnitEntries(historyReceptions, catalogs.resolveSeriesPerUnit),
    [historyReceptions, catalogs.resolveSeriesPerUnit]
  );

  const getHistoryTrayEntries = useCallback(
    () =>
      filterUnitEntriesByTrayFilters(
        filterUnitEntriesBySearch(
          filterUnitEntriesByDate(collectHistoryTrayEntries(), dateFilterFrom, dateFilterTo),
          historySearch
        ),
        historyFilters,
        {
          techIdFromModel: (modelId) =>
            catalogs.MASTER_MODELOS.find((m) => m.id === modelId)?.tecnologiaId,
          agencyLabelFromId: (agencyId) =>
            catalogs.CAC_AGENCIES.find((a) => a.id === agencyId)?.name || '',
        }
      ),
    [
      collectHistoryTrayEntries,
      dateFilterFrom,
      dateFilterTo,
      historySearch,
      historyFilters,
      catalogs.MASTER_MODELOS,
      catalogs.CAC_AGENCIES,
    ]
  );

  const historyFilterBrands = catalogs.MASTER_MARCAS.filter((b) =>
    !historyFilters.techId ||
    catalogs.MASTER_MODELOS.some((m) => m.marcaId === b.id && m.tecnologiaId === historyFilters.techId)
  );

  const historyFilterModels = catalogs.MASTER_MODELOS.filter(
    (m) =>
      (!historyFilters.techId || m.tecnologiaId === historyFilters.techId) &&
      (!historyFilters.brandId || m.marcaId === historyFilters.brandId)
  );

  const patchHistoryFilter = useCallback((patch: Partial<HistoryTrayFilters>) => {
    setHistoryFilters((prev) => ({ ...prev, ...patch }));
    setHistoryPage(1);
  }, []);

  const clearHistoryFilters = useCallback(() => {
    setHistoryFilters(EMPTY_HISTORY_TRAY_FILTERS);
    setHistoryPage(1);
  }, []);

  return {
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
    historyFilterBrands,
    historyFilterModels,
    patchHistoryFilter,
    clearHistoryFilters,
  };
}
