'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { Card, Button } from '@/components/ui';
import {
  BarChart3,
  Building2,
  AlertCircle,
  Download,
  Loader2,
  TrendingUp,
  Package,
  RefreshCw,
  X,
} from 'lucide-react';
import type { ReturnsReportStats } from '@/modules/returns/client/returnData';
import type { ReturnsReportPeriod, ReturnsReportPeriodOption } from '@/lib/returns/returnsReportPeriod';
import { erpFieldClass } from '@/lib/design/tokens';
import { CalendarDays } from 'lucide-react';
import { ExcelColumnFilter, type ExcelFilterSelection } from '@/components/molecules/ExcelColumnFilter';

type Props = {
  stats: ReturnsReportStats;
  loading?: boolean;
  error?: string | null;
  period?: ReturnsReportPeriod;
  periodOptions?: ReturnsReportPeriodOption[];
  onPeriodChange?: (period: ReturnsReportPeriod) => void;
  onExport: () => void;
  onRetry?: () => void;
};

type RankRow = { name: string; count: number };

const pct = (count: number, total: number) => (total > 0 ? (count / total) * 100 : 0);

function filterRankRows(
  rows: RankRow[],
  selected: ExcelFilterSelection,
  sortDir: 'asc' | 'desc' | null,
): RankRow[] {
  let list = rows;
  if (selected != null) {
    list = list.filter((row) => selected.has(row.name));
  }
  if (sortDir) {
    list = [...list].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }
  return list;
}

function RankList({
  title,
  subtitle,
  filterLabel,
  icon,
  rows,
  allRows,
  total,
  barClassName,
  emptyText,
  selected,
  onFilterChange,
  sortDir,
  onSort,
  onClearFilter,
}: {
  title: string;
  subtitle: string;
  filterLabel: string;
  icon: React.ReactNode;
  rows: RankRow[];
  allRows: RankRow[];
  total: number;
  barClassName: string;
  emptyText: string;
  selected: ExcelFilterSelection;
  onFilterChange: (next: ExcelFilterSelection) => void;
  sortDir: 'asc' | 'desc' | null;
  onSort: (dir: 'asc' | 'desc' | null) => void;
  onClearFilter: () => void;
}) {
  const filterValues = useMemo(
    () => allRows.map((row) => row.name).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
    [allRows],
  );

  const filteredTotal = useMemo(
    () => rows.reduce((sum, row) => sum + row.count, 0),
    [rows],
  );

  const max = rows[0]?.count || 1;
  const filterActive = selected != null || sortDir != null;
  const pctBase = filterActive ? filteredTotal : total;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          {icon}
          <div className="min-w-0">
            <h3 className="text-sm font-black uppercase tracking-widest text-[#181c3a]">{title}</h3>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              {subtitle}
              {filterActive ? ` · ${rows.length} de ${allRows.length} visibles` : ''}
            </p>
          </div>
        </div>
        <ExcelColumnFilter
          label={filterLabel}
          values={filterValues}
          selected={selected}
          onChange={onFilterChange}
          sortDir={sortDir}
          onSort={onSort}
        />
      </div>

      {filterActive ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-1.5">
          <span className="text-[10px] font-black uppercase tracking-wide text-sky-800">
            Filtro activo · {filteredTotal} casos en selección
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-slate-500 hover:text-slate-800"
            onClick={onClearFilter}
          >
            <X className="h-3 w-3" />
            Limpiar
          </button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="py-12 text-center text-slate-300">
          <p className="text-[10px] font-black uppercase tracking-widest">
            {filterActive ? 'Ningún registro coincide con el filtro' : emptyText}
          </p>
        </div>
      ) : (
        <div className="max-h-[460px] space-y-4 overflow-y-auto pr-1 custom-scrollbar">
          {rows.map((row, i) => (
            <div key={row.name} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-5 shrink-0 text-[10px] font-black text-slate-300">#{i + 1}</span>
                  <span className="truncate text-xs font-bold text-[#181c3a]" title={row.name}>
                    {row.name}
                  </span>
                </div>
                <div className="flex shrink-0 items-baseline gap-2">
                  <span className="text-sm font-black text-[#181c3a]">{row.count}</span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {pct(row.count, pctBase).toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${barClassName}`}
                  style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export const ReturnsReportPanel = memo(function ReturnsReportPanel({
  stats,
  loading,
  error,
  period,
  periodOptions = [],
  onPeriodChange,
  onExport,
  onRetry,
}: Props) {
  const [agencyFilter, setAgencyFilter] = useState<ExcelFilterSelection>(null);
  const [reasonFilter, setReasonFilter] = useState<ExcelFilterSelection>(null);
  const [agencySort, setAgencySort] = useState<'asc' | 'desc' | null>(null);
  const [reasonSort, setReasonSort] = useState<'asc' | 'desc' | null>(null);

  useEffect(() => {
    setAgencyFilter(null);
    setReasonFilter(null);
    setAgencySort(null);
    setReasonSort(null);
  }, [period, stats.total, stats.refreshedAt]);

  const filteredAgencies = useMemo(
    () => filterRankRows(stats.agencies, agencyFilter, agencySort),
    [stats.agencies, agencyFilter, agencySort],
  );

  const filteredReasons = useMemo(
    () => filterRankRows(stats.reasons, reasonFilter, reasonSort),
    [stats.reasons, reasonFilter, reasonSort],
  );

  if (loading) {
    return (
      <Card className="flex flex-col items-center justify-center py-32">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#2ec4f1]" />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Generando reporte de devoluciones...
        </p>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-300">
          ETL · calculando cantidades
        </p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="flex flex-col items-center justify-center gap-4 py-20">
        <AlertCircle className="h-10 w-10 text-rose-400" />
        <div className="max-w-lg px-6 text-center">
          <p className="mb-2 text-sm font-black uppercase tracking-widest text-[#181c3a]">
            No se pudo generar el reporte
          </p>
          <p className="text-xs font-medium text-slate-500">{error}</p>
        </div>
        {onRetry && (
          <Button variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
            Reintentar ETL
          </Button>
        )}
      </Card>
    );
  }

  const refreshedLabel = stats.refreshedAt
    ? new Date(stats.refreshedAt).toLocaleString()
    : null;

  return (
    <div className="animate-rise-in space-y-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Card className="relative overflow-hidden border-none bg-[#181c3a] text-white">
          <div className="absolute right-0 top-0 p-6 opacity-10">
            <Package className="h-24 w-24" />
          </div>
          <div className="relative z-10">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-white/50">
              Total Devoluciones
            </p>
            <p className="text-4xl font-black">{stats.total}</p>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
              {stats.periodLabel || 'Periodo seleccionado'} · cajas + bloques SAP
            </p>
          </div>
        </Card>

        <Card className="border-2 border-rose-100">
          <div className="mb-2 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-rose-500" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Agencia con Más Retornos
            </p>
          </div>
          <p className="truncate text-lg font-black text-[#181c3a]" title={stats.topAgency?.name || ''}>
            {stats.topAgency?.name || '—'}
          </p>
          <p className="mt-1 text-[11px] font-bold text-rose-500">
            {stats.topAgency
              ? `${stats.topAgency.count} casos · ${pct(stats.topAgency.count, stats.total).toFixed(1)}%`
              : 'Sin datos'}
          </p>
        </Card>

        <Card className="border-2 border-amber-100">
          <div className="mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Razón Principal
            </p>
          </div>
          <p className="truncate text-lg font-black text-[#181c3a]" title={stats.topReason?.name || ''}>
            {stats.topReason?.name || '—'}
          </p>
          <p className="mt-1 text-[11px] font-bold text-amber-500">
            {stats.topReason
              ? `${stats.topReason.count} casos · ${pct(stats.topReason.count, stats.total).toFixed(1)}%`
              : 'Sin datos'}
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-[#2ec4f1]" />
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-[#181c3a]">
              Análisis de Devoluciones
            </h2>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Periodo: {stats.periodLabel || '—'} · ranking por agencia y motivo
              {refreshedLabel ? ` · ETL ${refreshedLabel}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onPeriodChange && periodOptions.length > 0 ? (
            <label className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <select
                className={`${erpFieldClass} h-9 min-w-[180px] py-1.5 text-[11px] font-black uppercase tracking-wide`}
                value={period ?? 'month_current'}
                onChange={(e) => onPeriodChange(e.target.value as ReturnsReportPeriod)}
                aria-label="Filtrar reporte por periodo"
              >
                {periodOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {onRetry && (
            <Button variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
              Actualizar
            </Button>
          )}
          <Button variant="primary" leftIcon={<Download className="h-4 w-4" />} onClick={onExport}>
            Exportar Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RankList
          title="Agencias con Más Devoluciones"
          subtitle="Cantidad de casos por agencia / cliente"
          filterLabel="Agencia"
          icon={<Building2 className="h-5 w-5 text-rose-500" />}
          rows={filteredAgencies}
          allRows={stats.agencies}
          total={stats.total}
          barClassName="bg-rose-500"
          emptyText="Sin devoluciones registradas"
          selected={agencyFilter}
          onFilterChange={setAgencyFilter}
          sortDir={agencySort}
          onSort={setAgencySort}
          onClearFilter={() => {
            setAgencyFilter(null);
            setAgencySort(null);
          }}
        />
        <RankList
          title="Razones de Devolución"
          subtitle="Cantidad por motivo declarado"
          filterLabel="Motivo"
          icon={<TrendingUp className="h-5 w-5 text-amber-500" />}
          rows={filteredReasons}
          allRows={stats.reasons}
          total={stats.total}
          barClassName="bg-amber-500"
          emptyText="Sin motivos registrados"
          selected={reasonFilter}
          onFilterChange={setReasonFilter}
          sortDir={reasonSort}
          onSort={setReasonSort}
          onClearFilter={() => {
            setReasonFilter(null);
            setReasonSort(null);
          }}
        />
      </div>
    </div>
  );
});
