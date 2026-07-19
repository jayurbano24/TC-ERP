'use client';

import { memo, useMemo } from 'react';
import { Card, Button, notify } from '@/components/ui';
import { Truck, QrCode, AlertCircle } from 'lucide-react';

type Props = {
  box: any;
  dispatchMode: 'all' | 'specific';
  setDispatchMode: (v: 'all' | 'specific') => void;
  loadingSeries?: boolean;
  useOutboundDispatchHex: boolean;
  selectedDispatchBatchId: string | null;
  selectedDispatchBatchNumber: string | null;
  dispatchAction: string;
  setDispatchAction: (v: 'despacho' | 'traslado') => void;
  selectedSeriesForDispatch: string[];
  setSelectedSeriesForDispatch: (updater: (prev: string[]) => string[]) => void;
  dispatchDestination: string;
  dispatchNotes: string;
  setDispatchNotes: (v: string) => void;
  dispatchArea: string;
  setDispatchArea: (v: string) => void;
  isDispatching: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

function findSeriesInBox(box: any, scanned: string) {
  const val = scanned.trim().toUpperCase();
  if (!val) return null;
  return (
    (box.series || []).find((s: any) => {
      const candidates = [
        s.serial_number,
        s.sn,
        s.s1,
        s.s2,
        s.s3,
        s.s4,
        ...(Array.isArray(s.allSeries) ? s.allSeries : []),
      ]
        .filter(Boolean)
        .map((x: string) => String(x).trim().toUpperCase());
      return candidates.includes(val);
    }) || null
  );
}

function seriesPrimarySn(row: any): string {
  return String(row?.serial_number || row?.sn || row?.s1 || '').trim().toUpperCase();
}

export const DispatchModal = memo(function DispatchModal({
  box,
  dispatchMode,
  setDispatchMode,
  loadingSeries = false,
  useOutboundDispatchHex,
  selectedDispatchBatchId,
  selectedDispatchBatchNumber,
  dispatchAction,
  setDispatchAction,
  selectedSeriesForDispatch,
  setSelectedSeriesForDispatch,
  dispatchDestination,
  dispatchNotes,
  setDispatchNotes,
  dispatchArea,
  setDispatchArea,
  isDispatching,
  onClose,
  onConfirm,
}: Props) {
  const unitCount = box.unitCount ?? box.series?.length ?? 0;
  const salidaLabel =
    dispatchAction === 'despacho'
      ? dispatchDestination || '—'
      : dispatchArea || '—';

  const selectedRows = useMemo(() => {
    const bySn = new Map<string, any>();
    for (const s of box.series || []) {
      const sn = seriesPrimarySn(s);
      if (sn) bySn.set(sn, s);
      for (const extra of [s.s1, s.s2, s.s3, s.s4, ...(s.allSeries || [])]) {
        const k = String(extra || '').trim().toUpperCase();
        if (k && !bySn.has(k)) bySn.set(k, s);
      }
    }
    return selectedSeriesForDispatch.map((sn) => {
      const row = bySn.get(sn.toUpperCase());
      return {
        sn,
        marca:
          row?.marcaLabel ||
          box.marcaLabel ||
          row?.marca ||
          box.marca ||
          '—',
        modelo:
          row?.modeloLabel ||
          box.modeloLabel ||
          row?.modelo ||
          box.modelo ||
          '—',
        tecnologia:
          row?.tecnologiaLabel ||
          box.tecnologia ||
          row?.tecnologia ||
          '—',
        salida: salidaLabel,
        os: row?.ordenServicio || '—',
      };
    });
  }, [box, selectedSeriesForDispatch, salidaLabel]);

  const confirmDisabled =
    isDispatching ||
    !dispatchDestination.trim() ||
    loadingSeries ||
    (dispatchMode === 'specific' && selectedSeriesForDispatch.length === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <Card className="w-full max-w-2xl shadow-2xl animate-rise-in p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="border-b border-[var(--border)] bg-[var(--surface)] px-5 py-5 flex items-center gap-3 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/15">
            <Truck className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <div>
            <h3 className="font-black text-lg text-[var(--heading)]">Procesar Caja de Inventario</h3>
            <p className="text-[10px] text-[var(--accent)] font-bold uppercase tracking-widest">{box.id}</p>
          </div>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {useOutboundDispatchHex && selectedDispatchBatchId && (
            <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Lote activo: {selectedDispatchBatchNumber || selectedDispatchBatchId}
            </p>
          )}

          <div className="flex bg-[var(--surface-hover)] p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setDispatchAction('despacho')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${dispatchAction === 'despacho' ? 'bg-[var(--surface)] text-emerald-600 shadow-sm' : 'text-[var(--muted)]'}`}
            >
              Despachar (Salida)
            </button>
            <button
              type="button"
              onClick={() => setDispatchAction('traslado')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${dispatchAction === 'traslado' ? 'bg-[var(--surface)] text-indigo-600 shadow-sm' : 'text-[var(--muted)]'}`}
            >
              Trasladar a Área
            </button>
          </div>

          <div className="flex bg-[var(--surface-hover)] p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setDispatchMode('all')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${dispatchMode === 'all' ? 'bg-[var(--surface)] text-[var(--heading)] shadow-sm' : 'text-[var(--muted)]'}`}
            >
              Toda la caja ({unitCount})
            </button>
            <button
              type="button"
              onClick={() => setDispatchMode('specific')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${dispatchMode === 'specific' ? 'bg-[var(--surface)] text-[var(--heading)] shadow-sm' : 'text-[var(--muted)]'}`}
            >
              Series específicas
            </button>
          </div>

          {loadingSeries && (
            <p className="text-xs text-[var(--muted)]">Cargando series de la caja…</p>
          )}

          {dispatchMode === 'specific' && (
            <>
              <p className="text-sm text-[var(--foreground)]">
                Escanea las series a procesar. La caja conservará las restantes.
              </p>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">Pistolear Serie</label>
                <div className="relative">
                  <QrCode className="absolute left-3 top-2.5 h-4 w-4 text-emerald-500" />
                  <input
                    type="text"
                    placeholder="Escanea la serie aquí..."
                    disabled={loadingSeries}
                    className="w-full bg-[var(--surface-hover)] pl-9 pr-3 py-2 text-sm border border-[var(--border)] focus:border-emerald-500 rounded-lg outline-none transition-colors"
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const val = e.currentTarget.value.trim().toUpperCase();
                      if (!val) return;
                      const exists = findSeriesInBox(box, val);
                      if (exists) {
                        const sn = seriesPrimarySn(exists);
                        if (sn && !selectedSeriesForDispatch.includes(sn)) {
                          setSelectedSeriesForDispatch((prev) => [...prev, sn]);
                          const marca = exists.marcaLabel || box.marcaLabel || '—';
                          const modelo = exists.modeloLabel || box.modeloLabel || '—';
                          const tech = exists.tecnologiaLabel || box.tecnologia || '—';
                          notify.success('Serie agregada', {
                            description: `${sn} · ${marca} / ${modelo} / ${tech} · Salida: ${salidaLabel}`,
                          });
                        } else if (sn) {
                          notify.warning(`La serie ${sn} ya está seleccionada.`);
                        }
                      } else {
                        notify.warning(`La serie ${val} no pertenece a esta caja.`);
                      }
                      e.currentTarget.value = '';
                    }}
                    autoFocus
                  />
                </div>
              </div>

              {selectedRows.length > 0 && (
                <div className="border border-emerald-100 bg-emerald-50/50 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                      Equipos a despachar
                    </span>
                    <span className="text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                      {selectedRows.length}
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-[220px] overflow-y-auto rounded-lg border border-emerald-100 bg-[var(--surface)]">
                    <table className="w-full text-left text-[11px]">
                      <thead className="sticky top-0 bg-[var(--surface-hover)] border-b border-[var(--border)]">
                        <tr className="text-[9px] font-black uppercase tracking-wider text-[var(--muted)]">
                          <th className="px-2 py-2">Serie</th>
                          <th className="px-2 py-2">Marca</th>
                          <th className="px-2 py-2">Modelo</th>
                          <th className="px-2 py-2">Tecnología</th>
                          <th className="px-2 py-2">Salida</th>
                          <th className="px-2 py-2 w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRows.map((row) => (
                          <tr key={row.sn} className="border-b border-[var(--border)] last:border-0">
                            <td className="px-2 py-2 font-mono font-bold text-emerald-700 whitespace-nowrap">
                              {row.sn}
                              {row.os && row.os !== '—' && (
                                <div className="text-[9px] font-semibold text-[var(--muted)]">{row.os}</div>
                              )}
                            </td>
                            <td className="px-2 py-2 text-[var(--foreground)] whitespace-nowrap">{row.marca}</td>
                            <td className="px-2 py-2 text-[var(--foreground)] whitespace-nowrap">{row.modelo}</td>
                            <td className="px-2 py-2 text-[var(--foreground)] whitespace-nowrap">{row.tecnologia}</td>
                            <td className="px-2 py-2 font-bold text-[var(--heading)] whitespace-nowrap">{row.salida}</td>
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                className="text-[var(--muted)] hover:text-red-500 transition-colors text-sm font-bold"
                                onClick={() =>
                                  setSelectedSeriesForDispatch((prev) =>
                                    prev.filter((item) => item !== row.sn)
                                  )
                                }
                                aria-label={`Quitar ${row.sn}`}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {dispatchMode === 'all' && (
            <div className="bg-[var(--surface-hover)] border border-[var(--border)] p-3 rounded-xl space-y-2">
              <p className="text-sm text-[var(--foreground)]">
                Se procesarán las <strong>{unitCount}</strong> unidades de la caja{' '}
                <strong>{box.id}</strong> mediante el motor transaccional del servidor.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5">
                  <div className="text-[9px] font-black uppercase text-[var(--muted)]">Marca</div>
                  <div className="font-bold text-[var(--foreground)]">{box.marcaLabel || box.marca || '—'}</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5">
                  <div className="text-[9px] font-black uppercase text-[var(--muted)]">Modelo</div>
                  <div className="font-bold text-[var(--foreground)]">{box.modeloLabel || box.modelo || '—'}</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5">
                  <div className="text-[9px] font-black uppercase text-[var(--muted)]">Tecnología</div>
                  <div className="font-bold text-[var(--foreground)]">{box.tecnologia || '—'}</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5">
                  <div className="text-[9px] font-black uppercase text-[var(--muted)]">Salida</div>
                  <div className="font-bold text-[var(--foreground)]">{salidaLabel}</div>
                </div>
              </div>
            </div>
          )}

          {dispatchAction === 'despacho' ? (
            <>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">Conduce de Salida *</label>
                <input
                  type="text"
                  value={dispatchDestination}
                  readOnly
                  placeholder="Generando código..."
                  className="w-full bg-[var(--surface-hover)] text-[var(--muted)] p-3 rounded-xl border border-[var(--border)] font-bold text-sm outline-none cursor-not-allowed"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">Notas Adicionales (Opcional)</label>
                <textarea
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  placeholder="Observaciones adicionales sobre el despacho..."
                  className="w-full bg-[var(--surface-hover)] p-3 rounded-xl border border-[var(--border)] text-sm outline-none focus:border-emerald-500 transition-colors"
                  rows={2}
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 leading-tight">
                  {dispatchMode === 'all'
                    ? 'Todas las series de la caja pasarán a despachado y saldrán del inventario de bodega.'
                    : 'Solo las series seleccionadas serán despachadas; el resto permanece en la caja.'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">Área de Destino *</label>
                <select
                  value={dispatchArea}
                  onChange={(e) => setDispatchArea(e.target.value)}
                  className="w-full bg-[var(--surface)] text-[var(--foreground)] p-3 rounded-xl border border-[var(--border)] font-bold text-sm outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="Diagnóstico">Diagnóstico</option>
                  <option value="Reparación">Reparación (Calidad)</option>
                  <option value="Bodega Central">Reacondicionado (Bodega)</option>
                  <option value="L3">L3</option>
                  <option value="Bodega SCRAP">SCRAP</option>
                  <option value="Bodega Obsoleto">Obsoleto</option>
                </select>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl flex gap-3">
                <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0" />
                <p className="text-xs text-indigo-700 leading-tight">
                  {dispatchMode === 'all'
                    ? `La caja completa se moverá al área ${dispatchArea}.`
                    : `Las series seleccionadas se moverán al área ${dispatchArea}.`}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-[var(--border)] flex justify-end gap-3 bg-[var(--surface-hover)] shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isDispatching}>
            Cancelar
          </Button>
          <Button
            className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 border-none"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {isDispatching ? 'Procesando...' : dispatchAction === 'despacho' ? 'Confirmar Despacho' : 'Confirmar Traslado'}
          </Button>
        </div>
      </Card>
    </div>
  );
});
