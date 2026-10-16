'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, ShieldCheck, ShieldOff, RotateCcw, FileSpreadsheet } from 'lucide-react';
import { apiFetch } from '@/lib/http/apiFetch';
import { erpTableHeader, erpTableHeaderText } from '@/lib/design/tokens';
import { notify } from '@/components/ui';
import {
  WarrantyCoverageBar,
  WarrantyTechBarChart,
  WarrantyTrendChart,
  type WarrantyTrendPoint,
} from './WarrantyPackCharts';

export type WarrantyBreakdownRow = {
  id: string;
  label: string;
  enGarantia: number;
  vencida: number;
  total: number;
};

export type WarrantySummary = {
  periodDays: number;
  totalOsDespachadas: number;
  osConFechaDespacho: number;
  osSinFechaDespacho: number;
  enGarantia: number;
  vencida: number;
  elegiblesDespachados: number;
  reingresosGarantia: number;
  reingresosEnVentana90: number;
  byTechnology: WarrantyBreakdownRow[];
  byModel: WarrantyBreakdownRow[];
  computedAt: string;
  snapshotRefreshedAt?: string | null;
  snapshotRefreshMs?: number | null;
  snapshotRowCount?: number | null;
  snapshotEmpty?: boolean;
  noElegiblesPerfil?: number;
  trendByMonth?: WarrantyTrendPoint[];
  bootstrapAttempted?: boolean;
  bootstrapError?: string | null;
};

async function fetchWarrantySummary(): Promise<WarrantySummary> {
  const res = await apiFetch('/api/v1/warranty/summary');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'No se pudo cargar el resumen de garantías');
  }
  return res.json() as Promise<WarrantySummary>;
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  tone: 'emerald' | 'rose' | 'violet' | 'amber' | 'slate';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
      : tone === 'rose'
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
        : tone === 'violet'
          ? 'border-violet-500/30 bg-violet-500/10 text-violet-400'
          : tone === 'amber'
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
            : 'border-[var(--border)] bg-[var(--surface-hover)] text-[var(--foreground)]';

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{label}</p>
          <p className="text-2xl font-black tabular-nums mt-1">{value.toLocaleString('es-GT')}</p>
          <p className="text-[11px] opacity-70 mt-1">{sub}</p>
        </div>
        <div className="opacity-80">{icon}</div>
      </div>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: WarrantyBreakdownRow[];
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-hover)]">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--heading)]">{title}</h3>
      </div>
      <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
        <table className="w-full text-left border-collapse min-w-[420px]">
          <thead className={`sticky top-0 z-10 ${erpTableHeader}`}>
            <tr>
              <th className={`px-3 py-2 text-[10px] font-black uppercase ${erpTableHeaderText}`}>Nombre</th>
              <th className={`px-3 py-2 text-[10px] font-black uppercase text-right ${erpTableHeaderText}`}>En garantía</th>
              <th className={`px-3 py-2 text-[10px] font-black uppercase text-right ${erpTableHeaderText}`}>Vencida</th>
              <th className={`px-3 py-2 text-[10px] font-black uppercase text-right ${erpTableHeaderText}`}>Total elegible</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-sm text-[var(--muted)] text-center">
                  Sin equipos elegibles (Listo / Bueno) con fecha de despacho.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-hover)]/80">
                  <td className="px-3 py-2 text-xs font-semibold text-[var(--foreground)]">{r.label}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums text-emerald-500">{r.enGarantia}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums text-rose-400">{r.vencida}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums font-bold">{r.total}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Dashboard Warranty Pack — alineado a OS despachadas (Inventario OS). */
type RefreshResult = { row_count?: number; refresh_ms?: number; refreshed_at?: string };

export function WarrantyPackPanel() {
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['warranty-pack-summary'],
    queryFn: fetchWarrantySummary,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const runEtlRefresh = async (): Promise<RefreshResult> => {
    const res = await apiFetch('/api/v1/warranty/refresh', { method: 'POST' });
    const body = (await res.json().catch(() => ({}))) as RefreshResult & { error?: string };
    if (!res.ok) {
      throw new Error(body.error || 'No se pudo refrescar el snapshot');
    }
    await refetch();
    return body;
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      notify.info('Generando snapshot ETL…', {
        description: 'Primera vez ~1–2 min (~6K OS). No cierre esta pestaña.',
        duration: 120_000,
      });
      const result = await runEtlRefresh();
      const rows = result.row_count ?? 0;
      notify.success('Snapshot actualizado', {
        description:
          rows > 0
            ? `${rows.toLocaleString('es-GT')} OS despachadas indexadas.`
            : 'ETL terminó sin filas; revise criterios de despacho en Supabase.',
      });
    } catch (e) {
      notify.error('Refresh ETL fallido', {
        description: e instanceof Error ? e.message : undefined,
        duration: 20_000,
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await apiFetch('/api/v1/warranty/export');
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'No se pudo generar el reporte');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `WARRANTY_PACK_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      notify.success('Reporte Warranty Pack descargado');
    } catch (e) {
      notify.error('Exportación fallida', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-[var(--heading)] flex items-center gap-2">
              <Shield className="w-4 h-4 text-violet-400" />
              Warranty Pack
            </h2>
            <p className="text-xs text-[var(--muted)] mt-1 max-w-3xl">
              Misma base que <strong className="text-[var(--foreground)]">Inventario OS → Despachadas</strong>{' '}
              (1 OS = 1 equipo). Solo equipos con <strong className="text-[var(--foreground)]">perfil de garantía</strong>{' '}
              (<strong className="text-[var(--foreground)]">Equipo Listo</strong> o <strong className="text-[var(--foreground)]">Bueno B</strong>)
              generan mediciones en pack; desde oct-2026 es obligatorio al despachar. Detalle vía Excel.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting || isLoading}
              className="text-[10px] font-black uppercase tracking-wider px-3 py-2 rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 inline-flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {exporting ? 'Generando…' : 'Reporte Excel'}
            </button>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing || isFetching}
              className={
                data?.snapshotEmpty
                  ? 'text-[10px] font-black uppercase tracking-wider px-4 py-2 rounded-lg border border-amber-500/50 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 disabled:opacity-50'
                  : 'text-[10px] font-black uppercase tracking-wider px-3 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-hover)] disabled:opacity-50'
              }
            >
              {refreshing ? 'Generando snapshot…' : isFetching ? 'Leyendo…' : 'Refrescar datos'}
            </button>
          </div>
        </div>
      </div>

      {isLoading && !data ? (
        <p className="text-sm text-[var(--muted)]">
          Generando o leyendo snapshot ETL… La primera carga puede tardar hasta 2 minutos (~6K OS).
        </p>
      ) : isError ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {(error as Error).message}
        </div>
      ) : data ? (
        <>
          {data.snapshotEmpty ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 space-y-2">
              {data.bootstrapError ? (
                <p className="text-rose-200">
                  No se pudo generar el snapshot automáticamente: <strong>{data.bootstrapError}</strong>
                </p>
              ) : null}
              <p>
                Aún no hay datos. Pulse <strong>Refrescar datos</strong> (~2 min) o en Supabase ejecute{' '}
                <code className="font-mono text-xs bg-black/20 px-1 rounded">
                  SELECT public.refresh_warranty_pack_snapshot();
                </code>
              </p>
              <p className="text-xs opacity-80">
                Si falla desde la app, configure <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> en Vercel.
                Si el error menciona <code className="font-mono">disp.created_at</code>, aplique{' '}
                <code className="font-mono">267_warranty_pack_dispatch_date_fix.sql</code>. Gráficos:{' '}
                <code className="font-mono">266_warranty_pack_charts.sql</code>.
              </p>
            </div>
          ) : null}

          {!data.snapshotEmpty ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 space-y-2">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--heading)]">
                Composición despachadas vs garantía
              </h3>
              <WarrantyCoverageBar
                total={data.totalOsDespachadas}
                elegibles={data.elegiblesDespachados}
                enGarantia={data.enGarantia}
                noElegibles={data.noElegiblesPerfil ?? Math.max(0, data.totalOsDespachadas - data.elegiblesDespachados)}
                sinFecha={data.osSinFechaDespacho}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3">
            <KpiCard
              label="OS despachadas"
              value={data.totalOsDespachadas}
              sub="Cuadra con tile Despachadas"
              icon={<Shield className="w-5 h-5" />}
              tone="slate"
            />
            <KpiCard
              label="Con fecha despacho"
              value={data.osConFechaDespacho}
              sub="Conduce o closed_at OS"
              icon={<Shield className="w-5 h-5" />}
              tone="slate"
            />
            <KpiCard
              label="En garantía"
              value={data.enGarantia}
              sub="Elegibles Listo/Bueno vigentes"
              icon={<ShieldCheck className="w-5 h-5" />}
              tone="emerald"
            />
            <KpiCard
              label="Garantía vencida"
              value={data.vencida}
              sub="Elegibles fuera de 90 días"
              icon={<ShieldOff className="w-5 h-5" />}
              tone="rose"
            />
            <KpiCard
              label="Reingreso garantía"
              value={data.reingresosGarantia}
              sub="OS marcadas Garantía"
              icon={<RotateCcw className="w-5 h-5" />}
              tone="violet"
            />
            <KpiCard
              label="Sin fecha"
              value={data.osSinFechaDespacho}
              sub="Completar conduce / cierre"
              icon={<ShieldOff className="w-5 h-5" />}
              tone="amber"
            />
          </div>

          {!data.snapshotEmpty ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--heading)] mb-3">
                  Barras por tecnología (elegibles)
                </h3>
                <WarrantyTechBarChart rows={data.byTechnology} />
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--heading)] mb-3">
                  Tendencia mensual (últimos 12 meses)
                </h3>
                <WarrantyTrendChart points={data.trendByMonth ?? []} />
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BreakdownTable title="Por tecnología (elegibles)" rows={data.byTechnology} />
            <BreakdownTable title="Por modelo (elegibles)" rows={data.byModel} />
          </div>

          <p className="text-[10px] text-[var(--muted)]">
            <strong className="text-[var(--foreground)]">En garantía</strong> cuenta solo elegibles (Listo/Bueno) dentro de 90 días desde
            despacho; el resto de OS despachadas (
            {(data.noElegiblesPerfil ?? Math.max(0, data.totalOsDespachadas - data.elegiblesDespachados)).toLocaleString('es-GT')}{' '}
            sin perfil elegible + vencidas) no entra en ese KPI. · Elegibles:{' '}
            {data.elegiblesDespachados.toLocaleString('es-GT')} OS · Snapshot:{' '}
            {data.snapshotRefreshedAt
              ? `${new Date(data.snapshotRefreshedAt).toLocaleString('es-GT')}${
                  data.snapshotRefreshMs ? ` (${(data.snapshotRefreshMs / 1000).toFixed(1)}s ETL)` : ''
                }`
              : '—'}{' '}
            · Excel: {data.totalOsDespachadas.toLocaleString('es-GT')} filas.
          </p>
        </>
      ) : null}
    </div>
  );
}
