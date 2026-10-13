'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchOntRunsPage } from '@/modules/ont-runs/client/ontRunsApi';
import type { OntRun, OntRunsListFilters, OntRunsVerdictSummary } from '@/modules/ont-runs/domain/types';
import { filtersForOntRunPeriod } from '@/modules/ont-runs/domain/ontRunPeriod';
import { normalizeOntRunsVerdictSummary } from '@/modules/ont-runs/domain/normalizeOntRunsSummary';

const emptySummary = (): OntRunsVerdictSummary => normalizeOntRunsVerdictSummary(null);

export function useOntRunsList() {
  const [filters, setFilters] = useState<OntRunsListFilters>(() => ({
    ...filtersForOntRunPeriod('today'),
    hideNotRun: true,
    page: 1,
    limit: 100,
  }));
  const [rows, setRows] = useState<OntRun[]>([]);
  const [summary, setSummary] = useState<OntRunsVerdictSummary>(emptySummary);
  const [duplicateSuppressed, setDuplicateSuppressed] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await fetchOntRunsPage(filters);
      setRows(result.rows);
      const s = result.summary;
      setSummary(normalizeOntRunsVerdictSummary(s, result.totalCount));
      setDuplicateSuppressed(result.duplicateSuppressed ?? 0);
      setTotalCount(Math.max(0, Number(result.totalCount) || 0));
      setTotalPages(Math.max(1, Number(result.totalPages) || 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar corridas');
      setRows([]);
      setSummary(emptySummary());
      setDuplicateSuppressed(0);
      setTotalCount(0);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchFilters = useCallback((patch: Partial<OntRunsListFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  }, []);

  const toggleExpanded = useCallback((rowKey: string) => {
    setExpandedRowKey((prev) => (prev === rowKey ? null : rowKey));
  }, []);

  return {
    filters,
    patchFilters,
    rows,
    summary,
    duplicateSuppressed,
    totalCount,
    totalPages,
    loading,
    error,
    reload: () => load(true),
    expandedRowKey,
    toggleExpanded,
  };
}
