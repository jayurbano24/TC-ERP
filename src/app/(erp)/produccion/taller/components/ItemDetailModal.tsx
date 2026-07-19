'use client';

import { memo } from 'react';
import { Card, Badge } from '@/components/ui';
import { Box, XCircle } from 'lucide-react';
import {
  entrySourceLabel,
  normalizeEntrySource,
  resolveEntrySource,
  type EntrySourceLabel,
} from '@/modules/workshop/shared/entrySource';

type Props = {
  item: any;
  activeTab: string;
  onClose: () => void;
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
    })
  );
}

/**
 * C1: modal de detalle de equipo extraído del monolito produccion/taller y memoizado.
 * Es read-only: solo recibe el item, el tab activo (color) y onClose.
 */
export const ItemDetailModal = memo(function ItemDetailModal({ item, activeTab, onClose }: Props) {
  const tipoIngreso =
    entrySourceLabel(
      resolveEntrySource({
        entry_source: item.tipo_ingreso,
        series_entry_map: item.series_entry_map,
        guide: item.guide,
        serial: item.sn,
      })
    ) || resolveSeriesTipo(item, item.sn);
  const courierName = item.courier_name || String(item.courier || '').split(/[–-]/).slice(1).join('-').trim() || '';

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#181c3a]/80 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
      <Card className="w-full max-w-2xl max-h-[92dvh] sm:max-h-[90vh] bg-[var(--surface)] text-[var(--foreground)] rounded-t-[1.75rem] sm:rounded-[2rem] shadow-2xl border border-[var(--border)] overflow-hidden animate-rise-in p-0 flex flex-col my-0 sm:my-4">
        <div
          className={`px-4 py-4 sm:px-6 sm:py-5 border-b border-white/10 flex justify-between items-center gap-3 text-white shrink-0 ${
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
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center text-white bg-white/20 backdrop-blur-sm shrink-0">
              <Box size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Badge
                  variant="blue"
                  className="font-medium text-[9px] uppercase border-none text-white bg-white/20 backdrop-blur-sm truncate max-w-full"
                >
                  {item.id}
                </Badge>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-white truncate">Detalle de Equipo</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors shrink-0 p-1"
            aria-label="Cerrar"
          >
            <XCircle size={28} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0 overscroll-contain">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-[var(--surface-hover)] p-3 sm:p-4 rounded-2xl border border-[var(--border)] min-w-0">
              <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-widest mb-1">SN Principal</p>
              <p className="text-sm font-medium text-[var(--foreground)] break-all">{item.sn}</p>
            </div>
            <div className="bg-[var(--surface-hover)] p-3 sm:p-4 rounded-2xl border border-[var(--border)] min-w-0">
              <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-widest mb-1">Marca / Modelo</p>
              <p className="text-sm font-medium text-[var(--foreground)] uppercase break-words">
                {item.marca} {item.modelo}
              </p>
            </div>
            <div className="bg-[var(--surface-hover)] p-3 sm:p-4 rounded-2xl border border-[var(--border)] min-w-0">
              <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-widest mb-1">Tecnología</p>
              <p className="text-sm font-medium text-[var(--foreground)] uppercase">{item.tecnologia}</p>
            </div>
            <div className="bg-[var(--surface-hover)] p-3 sm:p-4 rounded-2xl border border-[var(--border)] min-w-0">
              <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-widest mb-1">Total de Series</p>
              <p className="text-sm font-medium text-[var(--foreground)]">{item.total_series}</p>
            </div>
            <div className="bg-[var(--surface-hover)] p-3 sm:p-4 rounded-2xl border border-[var(--border)] min-w-0">
              <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-widest mb-1">
                Tipo de ingreso
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-black uppercase tracking-widest ${tipoIngresoBadgeClass(tipoIngreso || '')}`}
                >
                  {tipoIngreso === 'CAC' || tipoIngreso === 'PX' ? tipoIngreso : 'Sin dato'}
                </span>
                {courierName ? (
                  <span className="text-sm font-medium text-[var(--muted)] uppercase break-words">
                    {courierName}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="bg-[var(--surface-hover)] p-3 sm:p-4 rounded-2xl border border-[var(--border)] min-w-0">
              <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-widest mb-1">Sucursal / Agencia</p>
              <p className="text-sm font-medium text-[var(--foreground)] uppercase break-words">{item.agencia}</p>
            </div>
            <div className="sm:col-span-2 bg-[var(--surface-hover)] p-3 sm:p-4 rounded-2xl border border-[var(--border)] min-w-0">
              <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-widest mb-1">Guía de Ingreso</p>
              <p className="text-sm font-medium text-[var(--foreground)] uppercase break-all">{item.guide}</p>
            </div>
          </div>

          {item.all_sns && item.all_sns.length > 0 && (
            <div>
              <h4 className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-widest mb-2">
                Series del equipo (S1, S2…)
              </h4>
              <div className="flex flex-col gap-2">
                {item.all_sns.map((s: string, i: number) => {
                  const serieTipo = resolveSeriesTipo(item, s);
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-3 py-2.5 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg min-w-0"
                    >
                      <span className="text-[10px] font-medium text-[var(--foreground)] bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--border)] shrink-0">
                        S{i + 1}
                      </span>
                      <span className="text-sm font-medium text-[var(--foreground)] break-all min-w-0 flex-1">
                        {s}
                      </span>
                      <span
                        className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest ${tipoIngresoBadgeClass(serieTipo || '')}`}
                      >
                        {serieTipo === 'CAC' || serieTipo === 'PX' ? serieTipo : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
});
