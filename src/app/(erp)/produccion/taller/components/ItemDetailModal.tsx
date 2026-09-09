'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { Card, Badge } from '@/components/ui';
import { Box, Loader2, XCircle } from 'lucide-react';
import {
  entrySourceLabel,
  normalizeEntrySource,
  resolveEntrySource,
  type EntrySourceLabel,
} from '@/modules/workshop/shared/entrySource';
import { getSeriesHistory } from '@/modules/platform/client/audit';
import { formatWorkshopStageHistoryLabel, isSapValidatedSeriesStatus } from '@/modules/workshop/shared/workshopSeriesDisplay';
import { WorkshopHistoryRecordBody } from './WorkshopHistoryRecordBody';
import type { WorkshopCatalogEntry } from '@/modules/workshop/shared/workshopHistoryDisplay';

type Props = {
  item: any;
  activeTab: string;
  onClose: () => void;
  catDiagnosticos?: WorkshopCatalogEntry[];
  catReparaciones?: WorkshopCatalogEntry[];
  catalogNamesById?: Record<string, string>;
};

function tipoIngresoBadgeClass(tipo: string) {
  const t = String(tipo || '').toUpperCase();
  if (t === 'PX') return 'bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30';
  if (t === 'CAC') return 'bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/30';
  return 'bg-[var(--surface-hover)] text-[var(--muted)] border-[var(--border)]';
}

function resolveSeriesTipo(item: any, sn: string): EntrySourceLabel | null {
  const fromMap = entrySourceLabel(normalizeEntrySource(item.series_entry_map?.[sn]));
  if (fromMap) return fromMap;
  return entrySourceLabel(
    resolveEntrySource({
      entry_source: item.tipo_ingreso,
      series_entry_map: item.series_entry_map,
      guide: item.guide,
      serial: sn,
    }),
  );
}

function ingressDetailLabel(count: number): string {
  if (count === 1) return 'Primer ingreso';
  if (count === 2) return '2° ingreso (reingreso)';
  return `${count}° ingreso`;
}

const REPAIR_HISTORY_ACTIONS = new Set([
  'REPARACIÓN COMPLETADA',
  'REPARACIÓN L3 COMPLETADA',
  'REACONDICIONADO COMPLETADO',
  'DIAGNÓSTICO INICIAL COMPLETADO',
  'CONTROL DE CALIDAD COMPLETADO',
]);

export const ItemDetailModal = memo(function ItemDetailModal({
  item,
  activeTab,
  onClose,
  catDiagnosticos = [],
  catReparaciones = [],
  catalogNamesById = {},
}: Props) {
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const tipoIngreso =
    entrySourceLabel(
      resolveEntrySource({
        entry_source: item.tipo_ingreso,
        series_entry_map: item.series_entry_map,
        guide: item.guide,
        serial: item.sn,
      }),
    ) || resolveSeriesTipo(item, item.sn);
  const isReentry = Number(item.ingress_count) >= 2;
  const seriesList: string[] = item.all_sns?.length ? item.all_sns : item.sn ? [item.sn] : [];

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingHistory(true);
      try {
        const ids = item.all_dbIds?.length ? item.all_dbIds : item.dbId ? [item.dbId] : [];
        const data = ids.length > 0 ? await getSeriesHistory(ids) : [];
        if (!cancelled) setHistoryItems(data || []);
      } catch {
        if (!cancelled) setHistoryItems([]);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [item.all_dbIds, item.dbId]);

  const workshopHistory = useMemo(
    () => historyItems.filter((r) => REPAIR_HISTORY_ACTIONS.has(String(r.action || ''))),
    [historyItems],
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#181c3a]/80 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
      <Card className="w-full max-w-2xl max-h-[92dvh] sm:max-h-[90vh] bg-[var(--surface)] text-[var(--foreground)] rounded-t-[1.75rem] sm:rounded-[2rem] shadow-2xl border border-[var(--border)] overflow-hidden animate-rise-in p-0 flex flex-col my-0 sm:my-4">
        <div
          className={`px-3 py-3 sm:px-4 border-b border-white/10 flex justify-between items-center gap-2 text-white shrink-0 ${
            activeTab === 'diagnostico'
              ? 'bg-amber-500'
              : activeTab === 'reparacion'
                ? 'bg-blue-500'
                : activeTab === 'reacondicionado'
                  ? 'bg-emerald-500'
                  : activeTab === 'qc'
                    ? 'bg-purple-500'
                    : activeTab === 'l3'
                      ? 'bg-orange-500'
                      : activeTab === 'scraps'
                        ? 'bg-rose-500'
                        : activeTab === 'listo'
                          ? 'bg-teal-500'
                          : 'bg-[#181c3a]'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-white/20 backdrop-blur-sm shrink-0">
              <Box size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge
                  variant="blue"
                  className="font-medium text-[8px] uppercase border-none text-white bg-white/20 backdrop-blur-sm truncate max-w-full"
                >
                  {item.id}
                </Badge>
                {isReentry ? (
                  <Badge className="border-none bg-violet-500/90 text-white text-[8px] font-black uppercase">
                    {ingressDetailLabel(item.ingress_count)}
                  </Badge>
                ) : null}
              </div>
              <h3 className="text-base font-semibold text-white truncate leading-tight">Detalle de Equipo</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors shrink-0 p-0.5"
            aria-label="Cerrar"
          >
            <XCircle size={24} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-3 sm:p-4 space-y-3 overflow-y-auto flex-1 min-h-0 overscroll-contain">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-[var(--border)]">
              <div className="px-2.5 py-2 min-w-0 sm:col-span-1">
                <p className="text-[9px] font-medium text-[var(--muted)] uppercase tracking-wide">S1 · SAP</p>
                <p className="text-xs font-black text-emerald-700 break-all leading-snug mt-0.5">
                  {seriesList[0] || item.sn || '—'}
                </p>
              </div>
              <div className="px-2.5 py-2 min-w-0 sm:col-span-1">
                <p className="text-[9px] font-medium text-[var(--muted)] uppercase tracking-wide">Marca / Modelo</p>
                <p className="text-xs font-semibold text-[var(--foreground)] uppercase break-words leading-snug mt-0.5">
                  {item.marca} {item.modelo}
                </p>
              </div>
              <div
                className={`px-2.5 py-2 min-w-0 sm:col-span-1 ${
                  isReentry ? 'bg-violet-50/80' : ''
                }`}
              >
                <p className="text-[9px] font-medium text-[var(--muted)] uppercase tracking-wide">Ingreso</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span
                    className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-black uppercase ${tipoIngresoBadgeClass(tipoIngreso || '')}`}
                  >
                    {tipoIngreso === 'CAC' || tipoIngreso === 'PX' ? tipoIngreso : '—'}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase ${
                      isReentry ? 'text-violet-800' : 'text-[var(--muted)]'
                    }`}
                  >
                    {Number(item.ingress_count) === 1
                      ? '1°'
                      : `${Number(item.ingress_count) || 1}°`}
                  </span>
                </div>
              </div>
              <div className="px-2.5 py-2 min-w-0 sm:col-span-1">
                <p className="text-[9px] font-medium text-[var(--muted)] uppercase tracking-wide">Hist.</p>
                {(() => {
                  const label = formatWorkshopStageHistoryLabel(item);
                  if (!label) {
                    return <span className="text-[10px] font-medium text-[var(--muted)] mt-0.5 block">—</span>;
                  }
                  const hasRc = Boolean(item.passed_reacond);
                  const hasRp = Boolean(item.passed_repair);
                  return (
                    <span
                      className={`inline-flex mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                        hasRc && hasRp
                          ? 'bg-violet-100 text-violet-800'
                          : hasRc
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {label}
                    </span>
                  );
                })()}
              </div>
            </div>

            {seriesList.length > 0 ? (
              <div className="border-t border-[var(--border)] px-2.5 py-1.5">
                <p className="text-[9px] font-medium text-[var(--muted)] uppercase tracking-wide mb-1">
                  Series (S1–S4)
                </p>
                <div className="flex flex-col gap-0.5">
                  {seriesList.map((s: string, i: number) => {
                    const serieTipo = resolveSeriesTipo(item, s);
                    const sapOk = isSapValidatedSeriesStatus(item.series_sap_by_sn?.[s]);
                    return (
                      <div
                        key={`${s}-${i}`}
                        className="flex items-center gap-1.5 min-h-[26px] min-w-0"
                      >
                        <span
                          className={`text-[9px] font-bold px-1 py-0 rounded border shrink-0 w-7 text-center ${
                            i === 0 && sapOk
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'text-[var(--foreground)] bg-[var(--surface)] border-[var(--border)]'
                          }`}
                        >
                          S{i + 1}
                        </span>
                        <span className="text-xs font-medium text-[var(--foreground)] break-all min-w-0 flex-1 leading-tight">
                          {s}
                        </span>
                        {i === 0 && sapOk ? (
                          <span className="shrink-0 text-[8px] font-black uppercase text-emerald-700">SAP</span>
                        ) : null}
                        <span
                          className={`shrink-0 inline-flex px-1 py-0 rounded border text-[9px] font-black uppercase ${tipoIngresoBadgeClass(serieTipo || '')}`}
                        >
                          {serieTipo === 'CAC' || serieTipo === 'PX' ? serieTipo : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 flex flex-col">
            <h4 className="text-[9px] font-medium text-[var(--muted)] uppercase tracking-wide mb-1.5">
              Historial de reparación / taller
            </h4>
            {loadingHistory ? (
              <div className="flex items-center gap-2 py-4 text-[var(--muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs font-medium">Cargando historial…</span>
              </div>
            ) : workshopHistory.length === 0 ? (
              <p className="text-xs font-medium text-[var(--muted)] italic py-2">
                Sin eventos de diagnóstico, reparación o reacondicionado registrados.
              </p>
            ) : (
              <div className="space-y-2 max-h-[min(28rem,50vh)] overflow-y-auto pr-0.5">
                {workshopHistory.map((record) => (
                  <div
                    key={record.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2.5"
                  >
                    <p className="text-sm font-black text-[var(--heading)] uppercase leading-tight">{record.action}</p>
                    <p className="text-[10px] font-bold text-[var(--muted)] mt-0.5">
                      {new Date(record.changed_at).toLocaleString()} ·{' '}
                      {record.profiles?.full_name?.toUpperCase() || 'SISTEMA'}
                    </p>
                    <div className="mt-2">
                      <WorkshopHistoryRecordBody
                        action={String(record.action || '')}
                        payload={(record.payload || {}) as Record<string, unknown>}
                        diagnosticsCatalog={catDiagnosticos}
                        repairsCatalog={catReparaciones}
                        catalogNamesById={catalogNamesById}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
});
