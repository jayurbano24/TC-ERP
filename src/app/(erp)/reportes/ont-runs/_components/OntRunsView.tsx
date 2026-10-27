'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { detectOntRunPeriod, filtersForOntRunPeriod, type OntRunPeriodPreset } from '@/modules/ont-runs/domain/ontRunPeriod';
import { tallyOntRunVerdicts } from '@/modules/ont-runs/domain/tallyOntRunVerdicts';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Printer,
  RefreshCw,
  Search,
} from 'lucide-react';
import { ModulePage } from '@/components/module-page';
import { Card, Button, Badge } from '@/components/ui';
import { notify } from '@/components/ui/messaging/messageStore';
import { useOntRunsList } from '../_hooks/useOntRunsList';
import { OntRunDetailPanel } from './OntRunDetailPanel';
import { OntRunsActionPanel } from './OntRunsActionPanel';
import { printOntRunReport } from '@/modules/ont-runs/client/printOntRunReport';
import { batchPrintOntRunReports } from '@/modules/ont-runs/client/batchPrintOntRunReports';
import { exportOntRunsExcel } from '@/modules/ont-runs/client/exportOntRunsExcel';
import { fetchAllOntRuns } from '@/modules/ont-runs/client/ontRunsApi';
import type { OntRun, OntRunsListFilters } from '@/modules/ont-runs/domain/types';
import { ontRunListKey } from '@/modules/ont-runs/domain/ontRunListKey';
import { isNotRunVerdict } from '@/modules/ont-runs/domain/ontRunVerdict';
import { resolveOntRunBrandModel } from '@/modules/ont-runs/domain/resolveOntRunBrandModel';
import { groupOntRunEntriesBySerial, normalizeOntRunSerial } from '@/modules/ont-runs/domain/groupOntRunsBySerial';
import { coerceOntRunCount } from '@/modules/ont-runs/domain/normalizeOntRunsSummary';
import {
  EMPTY_ONT_RUN_EXCEL_FILTERS,
  filterOntRunEntriesByExcel,
  hasActiveOntRunExcelFilters,
  matchesOntRunExcelFilters,
  ontRunExcelColumnLabel,
  ONT_RUN_EXCEL_FILTER_COLS,
  type OntRunExcelFilterCol,
  type OntRunExcelFilters,
  uniqueOntRunExcelValues,
} from '@/modules/ont-runs/domain/ontRunsExcelFilters';
import {
  ExcelColumnFilter,
  type ExcelFilterSelection,
} from '@/components/molecules/ExcelColumnFilter';

function formatRecordedAtCompact(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function verdictBadge(verdict: string) {
  const v = verdict.toUpperCase();
  if (v === 'PASS') {
    return (
      <Badge variant="green" className="!px-1.5 !py-0 text-[8px] font-black uppercase">
        PASS
      </Badge>
    );
  }
  if (v === 'FAIL') {
    return (
      <Badge variant="red" className="!px-1.5 !py-0 text-[8px] font-black uppercase">
        FAIL
      </Badge>
    );
  }
  if (isNotRunVerdict(verdict)) {
    return (
      <Badge
        variant="yellow"
        className="!px-1.5 !py-0 text-[8px] font-black uppercase"
        title="Prueba no ejecutada o abortada en el certificador"
      >
        NOT_RUN
      </Badge>
    );
  }
  return (
    <Badge variant="slate" className="!px-1.5 !py-0 text-[8px] font-black uppercase">
      {verdict || '—'}
    </Badge>
  );
}

const fieldClass =
  'w-full h-8 px-2.5 bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border)] rounded-lg font-bold text-[10px] outline-none focus:border-[var(--accent)]';

const thClass = 'px-1.5 py-1.5 font-black whitespace-nowrap';
const tdClass = 'px-1.5 py-1 align-middle text-[9px] leading-tight';

export function OntRunsView() {
  const {
    filters,
    patchFilters,
    rows,
    summary,
    duplicateSuppressed,
    totalCount,
    totalPages,
    loading,
    error,
    reload,
    expandedRowKey,
    toggleExpanded,
  } = useOntRunsList();

  const [exporting, setExporting] = useState(false);
  const [batchPrinting, setBatchPrinting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedSerials, setExpandedSerials] = useState<Set<string>>(new Set());
  const [excelFilters, setExcelFilters] = useState<OntRunExcelFilters>(EMPTY_ONT_RUN_EXCEL_FILTERS);
  const [excelSortCol, setExcelSortCol] = useState<OntRunExcelFilterCol | null>(null);
  const [excelSortDir, setExcelSortDir] = useState<'asc' | 'desc' | null>(null);

  const rowEntries = useMemo(
    () => rows.map((run, rowIndex) => ({ run, rowKey: ontRunListKey(run, rowIndex) })),
    [rows]
  );

  const filteredRowEntries = useMemo(
    () => filterOntRunEntriesByExcel(rowEntries, excelFilters, excelSortCol, excelSortDir),
    [rowEntries, excelFilters, excelSortCol, excelSortDir]
  );

  const serialGroups = useMemo(
    () => groupOntRunEntriesBySerial(filteredRowEntries),
    [filteredRowEntries]
  );

  const excelOptionValues = useMemo(() => {
    const map = {} as Record<OntRunExcelFilterCol, string[]>;
    for (const col of ONT_RUN_EXCEL_FILTER_COLS) {
      const pool = rowEntries.filter((entry) => matchesOntRunExcelFilters(entry, excelFilters, col));
      map[col] = uniqueOntRunExcelValues(pool, col);
    }
    return map;
  }, [rowEntries, excelFilters]);

  const hasExcelColumnFilter = hasActiveOntRunExcelFilters(excelFilters) || Boolean(excelSortCol);

  const setExcelColFilter = useCallback((col: OntRunExcelFilterCol, next: ExcelFilterSelection) => {
    setExcelFilters((prev) => ({ ...prev, [col]: next }));
  }, []);

  const setExcelColSort = useCallback((col: OntRunExcelFilterCol, dir: 'asc' | 'desc' | null) => {
    if (dir == null) {
      setExcelSortCol(null);
      setExcelSortDir(null);
      return;
    }
    setExcelSortCol(col);
    setExcelSortDir(dir);
  }, []);

  const clearExcelFilters = useCallback(() => {
    setExcelFilters(EMPTY_ONT_RUN_EXCEL_FILTERS);
    setExcelSortCol(null);
    setExcelSortDir(null);
  }, []);

  const certifiedOnPage = useMemo(
    () => filteredRowEntries.filter(({ run }) => !isNotRunVerdict(run.verdict)),
    [filteredRowEntries]
  );

  const exportFilters = (): Omit<OntRunsListFilters, 'page' | 'limit'> => ({
    q: filters.q,
    from: filters.allData ? undefined : filters.from,
    to: filters.allData ? undefined : filters.to,
    allData: filters.allData,
    verdict: filters.verdict,
    hideNotRun: filters.hideNotRun,
    deviceType: filters.deviceType,
    station: filters.station,
  });

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const { rows: allRows, truncated } = await fetchAllOntRuns(exportFilters());
      if (allRows.length === 0) {
        notify.warning('Sin datos para exportar');
        return;
      }
      const suffix = filters.allData ? 'todos' : `${filters.from || 'inicio'}_${filters.to || 'fin'}`;
      await exportOntRunsExcel(allRows, suffix);
      if (truncated) {
        notify.warning('Exportación truncada a 10.000 filas — refine filtros.');
      } else {
        notify.success(`Excel generado (${allRows.length} corridas).`);
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  const runBatchPrint = async (runs: OntRun[], label: string) => {
    if (runs.length === 0) {
      notify.warning('No hay corridas certificadas para imprimir');
      return;
    }
    setBatchPrinting(true);
    try {
      const { printed, skipped } = await batchPrintOntRunReports(runs);
      notify.success(`${label}: ${printed} PDF(s) abiertos${skipped ? ` · ${skipped} NOT_RUN omitidas` : ''}.`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Error al imprimir');
    } finally {
      setBatchPrinting(false);
    }
  };

  const toggleRowSelected = useCallback((rowKey: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  }, []);

  const toggleSelectAllPage = useCallback(() => {
    setSelectedKeys((prev) => {
      if (prev.size === filteredRowEntries.length && filteredRowEntries.length > 0) return new Set();
      return new Set(filteredRowEntries.map((e) => e.rowKey));
    });
  }, [filteredRowEntries]);

  const toggleSerialGroup = useCallback((serialKey: string) => {
    setExpandedSerials((prev) => {
      const next = new Set(prev);
      if (next.has(serialKey)) next.delete(serialKey);
      else next.add(serialKey);
      return next;
    });
  }, []);

  const toggleGroupSelected = useCallback((rowKeys: string[]) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const allSelected = rowKeys.length > 0 && rowKeys.every((k) => next.has(k));
      if (allSelected) rowKeys.forEach((k) => next.delete(k));
      else rowKeys.forEach((k) => next.add(k));
      return next;
    });
  }, []);

  const selectedRuns = useMemo(
    () => rowEntries.filter((e) => selectedKeys.has(e.rowKey)).map((e) => e.run),
    [rowEntries, selectedKeys]
  );

  const handlePrintFilterCertified = async () => {
    setBatchPrinting(true);
    try {
      const { rows: allRows } = await fetchAllOntRuns({ ...exportFilters(), verdict: undefined, hideNotRun: true });
      const certified = allRows.filter((r) => !isNotRunVerdict(r.verdict));
      if (certified.length === 0) {
        notify.warning('No hay corridas certificadas en el filtro');
        return;
      }
      const { printed, skipped } = await batchPrintOntRunReports(certified);
      notify.success(`Filtro: ${printed} PDF(s) abiertos${skipped ? ` · ${skipped} omitidas` : ''}.`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Error al imprimir');
    } finally {
      setBatchPrinting(false);
    }
  };

  const pageTally = useMemo(() => tallyOntRunVerdicts(rows), [rows]);

  const dashboard = useMemo(() => {
    const pass = coerceOntRunCount(summary.pass);
    const fail = coerceOntRunCount(summary.fail);
    const notRun = coerceOntRunCount(summary.notRun);
    const total = coerceOntRunCount(summary.total);
    const serverHasTotals = pass + fail + notRun + total > 0;
    if (serverHasTotals || loading) {
      return {
        total: total || coerceOntRunCount(totalCount),
        pass,
        fail,
        notRun,
        todayCertified: coerceOntRunCount(summary.todayCertified),
        todayPass: coerceOntRunCount(summary.todayPass),
        todayFail: coerceOntRunCount(summary.todayFail),
        daily: summary.daily,
      };
    }
    return {
      total: coerceOntRunCount(totalCount) || rows.length,
      pass: pageTally.pass,
      fail: pageTally.fail,
      notRun: pageTally.notRun,
      todayCertified: pageTally.certified,
      todayPass: pageTally.pass,
      todayFail: pageTally.fail,
      daily: summary.daily,
    };
  }, [summary, loading, totalCount, rows.length, pageTally]);

  const certifiedTotal = dashboard.pass + dashboard.fail;
  const periodPreset = detectOntRunPeriod(filters);

  const setPeriod = (preset: OntRunPeriodPreset) => {
    patchFilters({ ...filtersForOntRunPeriod(preset), page: 1 });
  };

  const formatDayLabel = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso.slice(5);
    return d.toLocaleDateString('es-GT', { weekday: 'short', day: '2-digit', month: '2-digit' });
  };

  const renderRunRows = (run: OntRun, rowKey: string, nested: boolean): ReactNode[] => {
    const serialShown = normalizeOntRunSerial(run.serial) || '—';
    const open = expandedRowKey === rowKey;
    const { brand, model } = resolveOntRunBrandModel(run);
    const main = (
      <tr
        key={rowKey}
        className={`border-t border-[var(--border)] hover:bg-[var(--surface-hover)]/40 ${
          nested ? 'bg-[var(--surface)]/60' : ''
        }`}
      >
        <td className={tdClass}>
          <button
            type="button"
            onClick={() => toggleExpanded(rowKey)}
            className={`p-0.5 rounded hover:bg-[var(--surface-hover)] text-[var(--muted)] ${nested ? 'ml-2' : ''}`}
            aria-expanded={open}
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </td>
        <td className={`${tdClass} text-center`}>
          <input
            type="checkbox"
            className="h-3 w-3"
            checked={selectedKeys.has(rowKey)}
            onChange={() => toggleRowSelected(rowKey)}
            aria-label={`Seleccionar ${run.runId}`}
          />
        </td>
        <td className={`${tdClass} font-bold whitespace-nowrap tabular-nums ${nested ? 'pl-1' : ''}`}>
          {formatRecordedAtCompact(run.recordedAt)}
        </td>
        <td className={`${tdClass} font-mono font-black ${nested ? 'text-[8px]' : ''}`}>{run.runId}</td>
        <td className={`${tdClass} font-bold max-w-[120px] truncate font-mono text-[8px]`} title={serialShown}>
          {serialShown}
        </td>
        <td className={`${tdClass} font-bold max-w-[88px] truncate`} title={brand}>
          {brand}
        </td>
        <td className={`${tdClass} max-w-[120px] truncate`} title={model}>
          {model}
        </td>
        <td className={tdClass}>
          <span className="block truncate">{run.station || '—'}</span>
          <span className="block truncate text-[8px] text-[var(--muted)]">{run.operator || ''}</span>
        </td>
        <td className={`${tdClass} text-center`}>{verdictBadge(run.verdict)}</td>
        <td className={`${tdClass} text-center`}>
          <button
            type="button"
            title="PDF certificación"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--accent)]"
            onClick={() => void printOntRunReport(run)}
          >
            <Printer className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>
    );
    if (!open) return [main];
    return [
      main,
      <tr key={`${rowKey}-detail`}>
        <td colSpan={10} className="p-0">
          <OntRunDetailPanel run={run} />
        </td>
      </tr>,
    ];
  };

  return (
    <ModulePage
      title="TEC-LAB DUT"
      category="Gestión"
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/reportes"
            className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] hover:text-[var(--accent)]"
          >
            ← Motor de Reportes ERP
          </Link>
          <Badge variant="blue" className="uppercase tracking-widest text-[10px] font-black">
            TEC-LAB · DUT
          </Badge>
        </div>
      }
    >
      <div className="flex flex-wrap gap-1.5 mb-2">
        {(
          [
            ['today', 'Hoy'],
            ['7d', '7 días'],
            ['30d', '30 días'],
            ['all', 'Todos'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPeriod(id)}
            className={`h-7 px-2.5 rounded-lg text-[9px] font-black uppercase tracking-wide border ${
              periodPreset === id
                ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-2">
        <Card className="p-2.5 border border-[var(--accent)]/35 bg-[var(--accent)]/8 lg:col-span-2">
          <p className="text-[8px] font-black uppercase text-[var(--accent)]">Hoy · certificadas</p>
          <p className="text-2xl font-black text-[var(--heading)] leading-none mt-1">
            {loading ? '…' : dashboard.todayCertified}
          </p>
          <p className="text-[8px] font-bold text-[var(--muted)] mt-0.5">
            PASS {loading ? '…' : dashboard.todayPass} · FAIL {loading ? '…' : dashboard.todayFail}
          </p>
        </Card>
        <Card className="p-2.5 border border-emerald-500/25 bg-emerald-500/5">
          <p className="text-[8px] font-black uppercase text-emerald-700 dark:text-emerald-400">PASS (filtro)</p>
          <p className="text-xl font-black text-emerald-600 leading-none mt-1">{loading ? '…' : dashboard.pass}</p>
        </Card>
        <Card className="p-2.5 border border-red-500/25 bg-red-500/5">
          <p className="text-[8px] font-black uppercase text-red-700 dark:text-red-400">FAIL (filtro)</p>
          <p className="text-xl font-black text-red-600 leading-none mt-1">{loading ? '…' : dashboard.fail}</p>
        </Card>
        <Card className="p-2.5 border border-[var(--border)]">
          <p className="text-[8px] font-black uppercase text-[var(--muted)]">Certificadas (filtro)</p>
          <p className="text-xl font-black text-[var(--heading)] leading-none mt-1">{loading ? '…' : certifiedTotal}</p>
        </Card>
        <Card className="p-2.5 border border-[var(--border)]">
          <p className="text-[8px] font-black uppercase text-[var(--muted)]">En tabla</p>
          <p className="text-xl font-black text-[var(--heading)] leading-none mt-1">
            {loading
              ? '…'
              : Math.max(
                  coerceOntRunCount(dashboard.total),
                  coerceOntRunCount(totalCount),
                  rows.length
                )}
          </p>
        </Card>
      </div>

      {dashboard.daily.length > 0 ? (
        <Card className="p-2.5 mb-3 border border-[var(--border)]">
          <p className="text-[8px] font-black uppercase text-[var(--muted)] mb-2">Certificadas por día (7 días)</p>
          <div className="grid grid-cols-7 gap-1">
            {dashboard.daily.map((day) => {
              const certified = coerceOntRunCount(day.certified);
              const max = Math.max(
                1,
                ...dashboard.daily.map((d) => coerceOntRunCount(d.certified))
              );
              const h = Math.max(4, Math.round((certified / max) * 40));
              return (
                <div key={day.date} className="flex flex-col items-center gap-0.5 min-w-0">
                  <span className="text-[9px] font-black tabular-nums text-[var(--heading)]">{certified}</span>
                  <div className="w-full flex items-end justify-center h-10 bg-[var(--surface-hover)] rounded-md overflow-hidden">
                    <div
                      className="w-[70%] rounded-t-sm bg-[var(--accent)]"
                      style={{ height: `${h}px` }}
                      title={`PASS ${day.pass} · FAIL ${day.fail}`}
                    />
                  </div>
                  <span className="text-[7px] font-bold text-[var(--muted)] truncate w-full text-center">
                    {formatDayLabel(day.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-3 mb-3">
        <Card className="p-3 border border-[var(--border)] space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            <div className="col-span-2 relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--muted)]" />
              <input
                type="search"
                placeholder="RUN, serie, MAC…"
                className={`${fieldClass} pl-7`}
                value={filters.q ?? ''}
                onChange={(e) => patchFilters({ q: e.target.value })}
              />
            </div>
            <input
              type="date"
              disabled={filters.allData}
              className={`${fieldClass} disabled:opacity-50`}
              value={filters.from ?? ''}
              onChange={(e) => patchFilters({ from: e.target.value, allData: false })}
            />
            <input
              type="date"
              disabled={filters.allData}
              className={`${fieldClass} disabled:opacity-50`}
              value={filters.to ?? ''}
              onChange={(e) => patchFilters({ to: e.target.value, allData: false })}
            />
            <select
              className={fieldClass}
              value={String(filters.limit ?? 100)}
              onChange={(e) => patchFilters({ limit: Number(e.target.value) })}
            >
              <option value="25">25 / pág.</option>
              <option value="50">50 / pág.</option>
              <option value="100">100 / pág.</option>
            </select>
            <select
              className={fieldClass}
              value={filters.verdict ?? ''}
              onChange={(e) => patchFilters({ verdict: e.target.value })}
            >
              <option value="">Veredicto</option>
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
              <option value="NOT_RUN">NOT_RUN</option>
            </select>
            <input
              type="text"
              placeholder="Tipo"
              className={fieldClass}
              value={filters.deviceType ?? ''}
              onChange={(e) => patchFilters({ deviceType: e.target.value })}
            />
            <input
              type="text"
              placeholder="Estación"
              className={fieldClass}
              value={filters.station ?? ''}
              onChange={(e) => patchFilters({ station: e.target.value })}
            />
            <label className="flex items-center gap-1.5 h-8 px-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] cursor-pointer select-none col-span-2">
              <input
                type="checkbox"
                className="h-3 w-3"
                checked={Boolean(filters.allData)}
                onChange={(e) => (e.target.checked ? setPeriod('all') : setPeriod('today'))}
              />
              <span className="text-[9px] font-bold uppercase">Todos los datos</span>
            </label>
            <label className="flex items-center gap-1.5 h-8 px-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] cursor-pointer select-none col-span-2">
              <input
                type="checkbox"
                className="h-3 w-3"
                checked={Boolean(filters.hideNotRun) && !filters.verdict?.trim()}
                disabled={Boolean(filters.verdict?.trim())}
                onChange={(e) => patchFilters({ hideNotRun: e.target.checked, verdict: '' })}
              />
              <span className="text-[9px] font-bold uppercase">Ocultar NOT_RUN</span>
            </label>
            <Button
              type="button"
              variant="secondary"
              className="!h-8 !text-[10px] col-span-2"
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={reload}
            >
              Actualizar
            </Button>
            {hasExcelColumnFilter ? (
              <Button
                type="button"
                variant="outline"
                className="!h-8 !text-[10px] col-span-2"
                onClick={clearExcelFilters}
              >
                Limpiar filtros Excel
              </Button>
            ) : null}
          </div>
        </Card>

        <OntRunsActionPanel
          selectedCount={selectedRuns.length}
          pageCertifiedCount={certifiedOnPage.length}
          exporting={exporting}
          batchPrinting={batchPrinting}
          disabled={loading}
          onExportExcel={() => void handleExportExcel()}
          onPrintSelected={() => void runBatchPrint(selectedRuns, 'Selección')}
          onPrintPageCertified={() => void runBatchPrint(certifiedOnPage.map((e) => e.run), 'Página')}
          onPrintFilterCertified={() => void handlePrintFilterCertified()}
        />
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-2 text-xs font-bold text-[var(--danger)]">
          {error}
        </div>
      )}

      <Card className="overflow-hidden border border-[var(--border)] p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left border-collapse">
            <thead className="bg-[var(--surface)] text-[var(--muted)] sticky top-0 z-10 text-[8px] uppercase tracking-wider">
              <tr>
                <th className={`${thClass} w-6`} />
                <th className={`${thClass} w-7 text-center`}>
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={
                      filteredRowEntries.length > 0 && selectedKeys.size === filteredRowEntries.length
                    }
                    onChange={toggleSelectAllPage}
                    aria-label="Seleccionar página"
                  />
                </th>
                {ONT_RUN_EXCEL_FILTER_COLS.map((col) => (
                  <th key={col} className={col === 'verdict' ? `${thClass} text-center` : thClass}>
                    <ExcelColumnFilter
                      label={ontRunExcelColumnLabel(col)}
                      values={excelOptionValues[col]}
                      selected={excelFilters[col]}
                      onChange={(next) => setExcelColFilter(col, next)}
                      sortDir={excelSortCol === col ? excelSortDir : null}
                      onSort={(dir) => setExcelColSort(col, dir)}
                    />
                  </th>
                ))}
                <th className={`${thClass} w-8 text-center`}>PDF</th>
              </tr>
            </thead>
            <tbody className="text-[var(--foreground)]">
              {loading && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-[var(--muted)] text-xs">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-[var(--muted)] text-xs font-bold">
                    Sin corridas para el filtro.
                  </td>
                </tr>
              )}
              {!loading && rows.length > 0 && filteredRowEntries.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-[var(--muted)] text-xs font-bold">
                    Ninguna fila coincide con los filtros Excel de la página.
                    <button
                      type="button"
                      className="ml-2 font-black text-[var(--accent)] underline"
                      onClick={clearExcelFilters}
                    >
                      Limpiar
                    </button>
                  </td>
                </tr>
              )}
              {!loading &&
                serialGroups.flatMap((group) => {
                  if (group.entries.length === 1) {
                    const only = group.entries[0];
                    return renderRunRows(only.run, only.rowKey, false);
                  }

                  const groupOpen = expandedSerials.has(group.serialKey);
                  const groupKeys = group.entries.map((e) => e.rowKey);
                  const groupAllSelected =
                    groupKeys.length > 0 && groupKeys.every((k) => selectedKeys.has(k));
                  const latest = group.entries[0].run;

                  const header = (
                    <tr
                      key={`serial-${group.serialKey}`}
                      className="border-t border-[var(--border)] bg-[var(--surface-hover)]/30 hover:bg-[var(--surface-hover)]/50"
                    >
                      <td className={tdClass}>
                        <button
                          type="button"
                          onClick={() => toggleSerialGroup(group.serialKey)}
                          className="p-0.5 rounded hover:bg-[var(--surface-hover)] text-[var(--accent)]"
                          aria-expanded={groupOpen}
                          title={`${group.entries.length} corridas en esta serie`}
                        >
                          {groupOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                      <td className={`${tdClass} text-center`}>
                        <input
                          type="checkbox"
                          className="h-3 w-3"
                          checked={groupAllSelected}
                          onChange={() => toggleGroupSelected(groupKeys)}
                          aria-label={`Seleccionar serie ${group.serialLabel}`}
                        />
                      </td>
                      <td className={`${tdClass} font-bold whitespace-nowrap tabular-nums`}>
                        {formatRecordedAtCompact(group.latestRecordedAt)}
                        <span className="block text-[8px] font-bold text-[var(--muted)] normal-case">
                          {group.groupKind === 'batch' ? 'misma hora · carga sync' : `última · ${group.entries.length} runs`}
                        </span>
                      </td>
                      <td className={`${tdClass} font-mono font-black text-[8px]`} title={group.serialLabel}>
                        {group.entries.length > 1
                          ? `${group.entries.length}× JOB`
                          : group.entries[0]?.run.runId ?? '—'}
                      </td>
                      <td
                        className={`${tdClass} font-bold max-w-[120px] truncate font-mono text-[8px]`}
                        title={group.serialLabel}
                      >
                        {group.groupKind === 'batch' && group.entries.length > 1
                          ? 'Sin serie (lote)'
                          : group.serialLabel.startsWith('Lote')
                            ? '—'
                            : group.serialLabel}
                      </td>
                      <td className={`${tdClass} font-bold max-w-[88px] truncate`} title={group.brand}>
                        {group.brand}
                      </td>
                      <td className={`${tdClass} max-w-[120px] truncate`} title={group.model}>
                        {group.model}
                      </td>
                      <td className={tdClass}>
                        <span className="block truncate">{latest.station || '—'}</span>
                        <span className="block truncate text-[8px] text-[var(--muted)]">{latest.operator || ''}</span>
                      </td>
                      <td className={`${tdClass} text-center`}>
                        <div className="flex flex-wrap gap-0.5 justify-center">
                          {group.passCount > 0 ? (
                            <Badge variant="green" className="!px-1 !py-0 text-[7px]">
                              {group.passCount}P
                            </Badge>
                          ) : null}
                          {group.failCount > 0 ? (
                            <Badge variant="red" className="!px-1 !py-0 text-[7px]">
                              {group.failCount}F
                            </Badge>
                          ) : null}
                          {group.notRunCount > 0 ? (
                            <Badge variant="yellow" className="!px-1 !py-0 text-[7px]">
                              {group.notRunCount}N
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className={`${tdClass} text-center text-[var(--muted)]`}>—</td>
                    </tr>
                  );

                  if (!groupOpen) return [header];
                  return [
                    header,
                    ...group.entries.flatMap((entry) => renderRunRows(entry.run, entry.rowKey, true)),
                  ];
                })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2 bg-[var(--surface)]">
          <p className="text-[9px] font-bold text-[var(--muted)]">
            Pág. {filters.page ?? 1}/{totalPages} · {serialGroups.length} grupos ·{' '}
            {hasExcelColumnFilter
              ? `${filteredRowEntries.length}/${rowEntries.length} corridas (Excel)`
              : `${rowEntries.length} corridas`}
            {duplicateSuppressed > 0 ? (
              <span className="text-amber-700 dark:text-amber-400">
                {' '}
                · {duplicateSuppressed} dup. sync ocultos (mismo JOB/hora)
              </span>
            ) : null}{' '}
            · {selectedKeys.size} sel.
          </p>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="secondary"
              className="!h-7 !text-[10px] !px-2"
              disabled={(filters.page ?? 1) <= 1 || loading}
              onClick={() => patchFilters({ page: Math.max(1, (filters.page ?? 1) - 1) })}
            >
              Ant.
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="!h-7 !text-[10px] !px-2"
              disabled={(filters.page ?? 1) >= totalPages || loading}
              onClick={() => patchFilters({ page: (filters.page ?? 1) + 1 })}
            >
              Sig.
            </Button>
          </div>
        </div>
      </Card>
    </ModulePage>
  );
}
