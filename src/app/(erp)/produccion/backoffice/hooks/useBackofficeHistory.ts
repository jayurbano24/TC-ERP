'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CacTrayQueryParams, CacTrayStatsResponse, CacTrayUnitRow } from '@/lib/backoffice/cacTrayTypes';
import { trayRowsToHistoryEntries } from '@/lib/backoffice/trayRowAdapter';
import { buildTrayQueryString } from '@/lib/database/cacTrayUnits';
import {
  EMPTY_HISTORY_TRAY_FILTERS,
  HISTORY_TRAY_PAGE_SIZE,
  type HistoryTrayFilters,
  type HistoryUnitEntry,
} from '../historyTrayUtils';
import type { CatalogAgency, CatalogBrand, CatalogModel } from '../types';

type Catalogs = {
  CAC_AGENCIES: CatalogAgency[];
  MASTER_MARCAS: CatalogBrand[];
  MASTER_MODELOS: CatalogModel[];
};

function buildQueryParams(
  page: number,
  historySearch: string,
  historyFilters: HistoryTrayFilters,
  dateFilterFrom: string,
  dateFilterTo: string
): CacTrayQueryParams {
  return {
    page,
    limit: HISTORY_TRAY_PAGE_SIZE,
    from: dateFilterFrom || undefined,
    to: dateFilterTo || undefined,
    search: historySearch.trim() || undefined,
    guide: historyFilters.guide || undefined,
    pilot: historyFilters.pilot || undefined,
    courier: historyFilters.courier || undefined,
    receivedBy: historyFilters.receivedBy || undefined,
    status: historyFilters.status || undefined,
    osLabel: historyFilters.osLabel || undefined,
    sapDocument: historyFilters.sapDocument || undefined,
    techId: historyFilters.techId || undefined,
    brandId: historyFilters.brandId || undefined,
    modelId: historyFilters.modelId || undefined,
    agencyId: historyFilters.agencyId || undefined,
  };
}

async function fetchTrayPage(params: CacTrayQueryParams, includeSap = true) {
  const qs = buildTrayQueryString({ ...params, includeSap: includeSap ? undefined : false });
  const res = await fetch(`/api/backoffice/cac-history/tray?${qs}`, { cache: 'no-store' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Error al cargar bandeja CAC');
  return payload as {
    rows: unknown[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

async function fetchTrayStats(params: CacTrayQueryParams): Promise<CacTrayStatsResponse> {
  const { page: _p, limit: _l, ...statsParams } = params;
  const qs = buildTrayQueryString(statsParams);
  const res = await fetch(`/api/backoffice/cac-history/stats?${qs}`, { cache: 'no-store' });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error || 'Error al cargar estadísticas');
  return payload as CacTrayStatsResponse;
}

export function useBackofficeHistory(
  catalogs: Catalogs,
  dateFilterFrom: string,
  dateFilterTo: string,
  enabled = true
) {
  const historyFetchIdRef = useRef(0);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStatsLoading, setHistoryStatsLoading] = useState(false);
  const [trayEntries, setTrayEntries] = useState<HistoryUnitEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [historyStats, setHistoryStats] = useState<CacTrayStatsResponse>({ total: 0, byTechId: {} });
  const [historySearch, setHistorySearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [historyFilters, setHistoryFilters] = useState<HistoryTrayFilters>(EMPTY_HISTORY_TRAY_FILTERS);
  const [historyFiltersOpen, setHistoryFiltersOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(historySearch), 350);
    return () => clearTimeout(t);
  }, [historySearch]);

  const queryParams = useMemo(
    () => buildQueryParams(historyPage, debouncedSearch, historyFilters, dateFilterFrom, dateFilterTo),
    [historyPage, debouncedSearch, historyFilters, dateFilterFrom, dateFilterTo]
  );

  const fetchHistory = useCallback(
    async (opts?: { silent?: boolean; page?: number }) => {
      const fetchId = ++historyFetchIdRef.current;
      if (!opts?.silent) setHistoryLoading(true);
      setHistoryLoadError(null);

      const params = { ...queryParams, page: opts?.page ?? queryParams.page };

      try {
        const pageData = await fetchTrayPage(params, false);

        if (fetchId !== historyFetchIdRef.current) return;

        setTrayEntries(trayRowsToHistoryEntries(pageData.rows as CacTrayUnitRow[]));
        setTotalCount(pageData.totalCount);
        setTotalPages(pageData.totalPages);
        setHistoryLoadError(null);
        setHistoryLoading(false);

        void fetchTrayPage(params, true)
          .then((enriched) => {
            if (fetchId !== historyFetchIdRef.current) return;
            setTrayEntries(trayRowsToHistoryEntries(enriched.rows as CacTrayUnitRow[]));
          })
          .catch((error: unknown) => {
            console.error('Error enriching CAC tray SAP validation:', error);
          });

        setHistoryStatsLoading(true);
        void fetchTrayStats(params)
          .then((stats) => {
            if (fetchId !== historyFetchIdRef.current) return;
            setHistoryStats(stats);
          })
          .catch((error: unknown) => {
            if (fetchId !== historyFetchIdRef.current) return;
            console.error('Error fetching CAC tray stats:', error);
          })
          .finally(() => {
            if (fetchId === historyFetchIdRef.current) setHistoryStatsLoading(false);
          });
      } catch (error: unknown) {
        if (fetchId !== historyFetchIdRef.current) return;
        console.error('Error fetching CAC tray:', error);
        setHistoryLoadError(error instanceof Error ? error.message : 'No se pudo cargar el historial.');
      } finally {
        if (fetchId === historyFetchIdRef.current) setHistoryLoading(false);
      }
    },
    [queryParams]
  );

  useEffect(() => {
    if (!enabled) return;
    void fetchHistory();
  }, [enabled, fetchHistory]);

  const getHistoryTrayEntries = useCallback(() => trayEntries, [trayEntries]);

  const getUnfilteredHistoryTrayEntries = useCallback(
    () => trayEntries,
    [trayEntries]
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

  const fetchExportEntries = useCallback(async (): Promise<HistoryUnitEntry[]> => {
    const { page: _p, limit: _l, ...exportParams } = queryParams;
    const qs = buildTrayQueryString(exportParams);
    const res = await fetch(`/api/backoffice/cac-history/export?${qs}`, { cache: 'no-store' });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload?.error || 'Error al exportar');
    if (payload.truncated) {
      console.warn('Export truncado a 10.000 filas — refine filtros para export completo.');
    }
    return payload.entries as HistoryUnitEntry[];
  }, [queryParams]);

  return {
    historyLoadError,
    historyLoading,
    historyStatsLoading,
    historyReceptions: [] as unknown[],
    trayEntries,
    totalCount,
    totalPages,
    historyStats,
    historySearch,
    setHistorySearch,
    historyFilters,
    historyFiltersOpen,
    setHistoryFiltersOpen,
    historyPage,
    setHistoryPage,
    fetchHistory,
    fetchExportEntries,
    getHistoryTrayEntries,
    getUnfilteredHistoryTrayEntries,
    historyFilterBrands,
    historyFilterModels,
    patchHistoryFilter,
    clearHistoryFilters,
  };
}
