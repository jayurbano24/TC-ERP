'use client';

import { memo } from 'react';
import { Card, Button } from '@/components/ui';
import { BarChart3, Building2, AlertCircle, Download, Loader2, TrendingUp, Package, RefreshCw } from 'lucide-react';
import type { ReturnsReportStats } from '@/modules/returns/client/returnData';

type Props = {
  stats: ReturnsReportStats;
  loading?: boolean;
  error?: string | null;
  onExport: () => void;
  onRetry?: () => void;
};

const pct = (count: number, total: number) => (total > 0 ? (count / total) * 100 : 0);

function RankList({
  title,
  subtitle,
  icon,
  rows,
  total,
  barClassName,
  emptyText,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  rows: Array<{ name: string; count: number }>;
  total: number;
  barClassName: string;
  emptyText: string;
}) {
  const max = rows[0]?.count || 1;
  return (
    <Card className="space-y-5">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        {icon}
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-[#181c3a]">{title}</h3>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-1">{subtitle}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-12 text-center text-slate-300">
          <p className="text-[10px] font-black uppercase tracking-widest">{emptyText}</p>
        </div>
      ) : (
        <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
          {rows.map((row, i) => (
            <div key={row.name} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-black text-slate-300 w-5 shrink-0">#{i + 1}</span>
                  <span className="text-xs font-bold text-[#181c3a] truncate" title={row.name}>{row.name}</span>
                </div>
                <div className="flex items-baseline gap-2 shrink-0">
                  <span className="text-sm font-black text-[#181c3a]">{row.count}</span>
                  <span className="text-[10px] font-bold text-slate-400">{pct(row.count, total).toFixed(1)}%</span>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
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
  onExport,
  onRetry,
}: Props) {
  if (loading) {
    return (
      <Card className="py-32 flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#2ec4f1] mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Generando reporte de devoluciones...
        </p>
        <p className="text-[10px] font-bold text-slate-300 mt-2 uppercase tracking-widest">
          ETL · calculando cantidades
        </p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="py-20 flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-10 h-10 text-rose-400" />
        <div className="text-center max-w-lg px-6">
          <p className="text-sm font-black uppercase tracking-widest text-[#181c3a] mb-2">
            No se pudo generar el reporte
          </p>
          <p className="text-xs font-medium text-slate-500">{error}</p>
        </div>
        {onRetry && (
          <Button variant="outline" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={onRetry}>
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
    <div className="space-y-6 animate-rise-in">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card className="bg-[#181c3a] text-white border-none relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10"><Package className="w-24 h-24" /></div>
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-2">Total Devoluciones</p>
            <p className="text-4xl font-black">{stats.total}</p>
            <p className="text-[10px] font-bold text-white/40 mt-2 uppercase tracking-widest">
              Cantidad · cajas + bloques SAP
            </p>
          </div>
        </Card>

        <Card className="border-2 border-rose-100">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-4 h-4 text-rose-500" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Agencia con Más Retornos</p>
          </div>
          <p className="text-lg font-black text-[#181c3a] truncate" title={stats.topAgency?.name || ''}>
            {stats.topAgency?.name || '—'}
          </p>
          <p className="text-[11px] font-bold text-rose-500 mt-1">
            {stats.topAgency ? `${stats.topAgency.count} casos · ${pct(stats.topAgency.count, stats.total).toFixed(1)}%` : 'Sin datos'}
          </p>
        </Card>

        <Card className="border-2 border-amber-100">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Razón Principal</p>
          </div>
          <p className="text-lg font-black text-[#181c3a] truncate" title={stats.topReason?.name || ''}>
            {stats.topReason?.name || '—'}
          </p>
          <p className="text-[11px] font-bold text-amber-500 mt-1">
            {stats.topReason ? `${stats.topReason.count} casos · ${pct(stats.topReason.count, stats.total).toFixed(1)}%` : 'Sin datos'}
          </p>
        </Card>
      </div>

      <div className="flex items-center justify-between px-1 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-[#2ec4f1]" />
          <div>
            <h2 className="text-lg font-black text-[#181c3a] uppercase tracking-tight">Análisis de Devoluciones</h2>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-1">
              Ranking por agencia y por motivo
              {refreshedLabel ? ` · ETL ${refreshedLabel}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onRetry && (
            <Button variant="outline" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={onRetry}>
              Actualizar
            </Button>
          )}
          <Button variant="primary" leftIcon={<Download className="w-4 h-4" />} onClick={onExport}>
            Exportar Excel
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <RankList
          title="Agencias con Más Devoluciones"
          subtitle="Cantidad de casos por agencia / cliente"
          icon={<Building2 className="w-5 h-5 text-rose-500" />}
          rows={stats.agencies}
          total={stats.total}
          barClassName="bg-rose-500"
          emptyText="Sin devoluciones registradas"
        />
        <RankList
          title="Razones de Devolución"
          subtitle="Cantidad por motivo declarado"
          icon={<TrendingUp className="w-5 h-5 text-amber-500" />}
          rows={stats.reasons}
          total={stats.total}
          barClassName="bg-amber-500"
          emptyText="Sin motivos registrados"
        />
      </div>
    </div>
  );
});
