'use client';

import { memo, useMemo, useState } from 'react';
import { Card, Button, notify } from '@/components/ui';
import { Truck, QrCode, AlertCircle, Search } from 'lucide-react';

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

function normalizeSn(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function seriesCandidates(row: any): string[] {
  return [
    row?.serial_number,
    row?.sn,
    row?.s1,
    row?.s2,
    row?.s3,
    row?.s4,
    ...(Array.isArray(row?.allSeries) ? row.allSeries : []),
  ]
    .map((x) => normalizeSn(x))
    .filter(Boolean);
}

function findSeriesInBox(box: any, scanned: string) {
  const val = normalizeSn(scanned);
  if (!val) return null;
  return (
    (box.series || []).find((s: any) => seriesCandidates(s).includes(val)) || null
  );
}

function seriesPrimarySn(row: any): string {
  return normalizeSn(row?.serial_number || row?.sn || row?.s1);
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
  const [seriesFilter, setSeriesFilter] = useState('');
  const [showReview, setShowReview] = useState(false);
  const seriesRows: any[] = Array.isArray(box.series) ? box.series : [];
  const unitCount = Number(box.unitCount ?? seriesRows.length ?? 0);
  const salidaLabel =
    dispatchAction === 'despacho'
      ? dispatchDestination || '—'
      : dispatchArea || '—';

  const selectedSet = useMemo(
    () => new Set(selectedSeriesForDispatch.map((s) => normalizeSn(s))),
    [selectedSeriesForDispatch]
  );

  const filteredSeries = useMemo(() => {
    const q = normalizeSn(seriesFilter);
    if (!q) return seriesRows;
    return seriesRows.filter((s) => {
      const blob = [
        ...seriesCandidates(s),
        s.ordenServicio,
        s.marcaLabel,
        s.modeloLabel,
      ]
        .map((x) => normalizeSn(String(x || '')))
        .join(' ');
      return blob.includes(q);
    });
  }, [seriesRows, seriesFilter]);

  const seriesBySn = useMemo(() => {
    const bySn = new Map<string, any>();
    for (const s of seriesRows) {
      const sn = seriesPrimarySn(s);
      if (sn) bySn.set(sn, s);
      for (const extra of seriesCandidates(s)) {
        if (extra && !bySn.has(extra)) bySn.set(extra, s);
      }
    }
    return bySn;
  }, [seriesRows]);

  const toPreviewRow = (snRaw: string, row?: any) => {
    const key = normalizeSn(snRaw);
    const s = row || seriesBySn.get(key);
    return {
      sn: key,
      marca: s?.marcaLabel || box.marcaLabel || s?.marca || box.marca || '—',
      modelo: s?.modeloLabel || box.modeloLabel || s?.modelo || box.modelo || '—',
      tecnologia: s?.tecnologiaLabel || box.tecnologia || s?.tecnologia || '—',
      salida: salidaLabel,
      os: s?.ordenServicio || '—',
    };
  };

  const selectedRows = useMemo(
    () => selectedSeriesForDispatch.map((sn) => toPreviewRow(sn)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toPreviewRow usa box/salida/seriesBySn
    [selectedSeriesForDispatch, seriesBySn, box, salidaLabel]
  );

  /** Filas que se despacharán / trasladarán (toda la caja o selección). */
  const previewRows = useMemo(() => {
    if (dispatchMode === 'specific') return selectedRows;
    if (seriesRows.length > 0) {
      return seriesRows.map((row) => toPreviewRow(seriesPrimarySn(row), row)).filter((r) => r.sn);
    }
    // Fallback si no cargaron series: fila resumen
    return [
      {
        sn: `(${unitCount} equipos — detalle no cargado)`,
        marca: box.marcaLabel || box.marca || '—',
        modelo: box.modeloLabel || box.modelo || '—',
        tecnologia: box.tecnologia || '—',
        salida: salidaLabel,
        os: '—',
      },
    ];
  }, [dispatchMode, selectedRows, seriesRows, unitCount, box, salidaLabel, seriesBySn]);

  const toggleSeries = (row: any) => {
    const sn = seriesPrimarySn(row);
    if (!sn) return;
    setSelectedSeriesForDispatch((prev) => {
      const set = new Set(prev.map((x) => normalizeSn(x)));
      if (set.has(sn)) {
        return prev.filter((x) => normalizeSn(x) !== sn);
      }
      return [...prev, sn];
    });
  };

  const selectAllFiltered = () => {
    setSelectedSeriesForDispatch((prev) => {
      const set = new Set(prev.map((x) => normalizeSn(x)));
      for (const row of filteredSeries) {
        const sn = seriesPrimarySn(row);
        if (sn) set.add(sn);
      }
      return [...set];
    });
  };

  const clearSelection = () => setSelectedSeriesForDispatch(() => []);

  const addScannedSeries = (raw: string) => {
    const val = normalizeSn(raw);
    if (!val) return;
    if (seriesRows.length === 0) {
      notify.warning('Aún no hay series cargadas en esta caja.');
      return;
    }
    const exists = findSeriesInBox(box, val);
    if (!exists) {
      notify.warning(`La serie ${val} no pertenece a esta caja.`);
      return;
    }
    const sn = seriesPrimarySn(exists);
    if (!sn) return;
    if (selectedSet.has(sn)) {
      notify.warning(`La serie ${sn} ya está seleccionada.`);
      return;
    }
    setSelectedSeriesForDispatch((prev) => [...prev, sn]);
    notify.success('Serie agregada', {
      description: `${sn} · ${exists.marcaLabel || box.marcaLabel || '—'} / ${exists.modeloLabel || box.modeloLabel || '—'}`,
    });
  };

  const confirmDisabled =
    isDispatching ||
    loadingSeries ||
    (dispatchAction === 'despacho' && !dispatchDestination.trim()) ||
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
              Series específicas ({selectedSeriesForDispatch.length}/{seriesRows.length || unitCount})
            </button>
          </div>

          {loadingSeries && (
            <p className="text-xs text-[var(--muted)]">Cargando series de la caja…</p>
          )}

          {dispatchMode === 'specific' && (
            <>
              <p className="text-sm text-[var(--foreground)]">
                Marca las series o pistolea. La caja conservará las restantes.
              </p>

              {!loadingSeries && seriesRows.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-700 leading-tight">
                    No se cargaron series de esta caja. Cierra el modal e intenta de nuevo, o usa
                    «Toda la caja» si el conteo es correcto.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                  Pistolear Serie
                </label>
                <div className="relative">
                  <QrCode className="absolute left-3 top-2.5 h-4 w-4 text-emerald-500" />
                  <input
                    type="text"
                    placeholder="Escanea la serie y Enter…"
                    disabled={loadingSeries || seriesRows.length === 0}
                    className="w-full bg-[var(--surface-hover)] pl-9 pr-3 py-2 text-sm border border-[var(--border)] focus:border-emerald-500 rounded-lg outline-none transition-colors"
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      addScannedSeries(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }}
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                    Seleccionar de la lista
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-[10px] font-bold text-emerald-600 hover:underline disabled:opacity-40"
                      disabled={loadingSeries || filteredSeries.length === 0}
                      onClick={selectAllFiltered}
                    >
                      Marcar todas
                    </button>
                    <button
                      type="button"
                      className="text-[10px] font-bold text-[var(--muted)] hover:underline disabled:opacity-40"
                      disabled={selectedSeriesForDispatch.length === 0}
                      onClick={clearSelection}
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--muted)]" />
                  <input
                    type="text"
                    value={seriesFilter}
                    onChange={(e) => setSeriesFilter(e.target.value)}
                    placeholder="Filtrar por serie, OS, marca…"
                    disabled={loadingSeries || seriesRows.length === 0}
                    className="w-full bg-[var(--surface-hover)] pl-9 pr-3 py-2 text-sm border border-[var(--border)] rounded-lg outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="max-h-[200px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  {filteredSeries.length === 0 ? (
                    <p className="p-3 text-xs text-[var(--muted)]">Sin series para mostrar.</p>
                  ) : (
                    <ul className="divide-y divide-[var(--border)]">
                      {filteredSeries.map((row, idx) => {
                        const sn = seriesPrimarySn(row);
                        const checked = sn ? selectedSet.has(sn) : false;
                        return (
                          <li key={sn || `${row.ordenServicio || 'row'}-${idx}`}>
                            <label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-[var(--surface-hover)]">
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={checked}
                                onChange={() => toggleSeries(row)}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block font-mono text-[11px] font-bold text-emerald-700">
                                  {sn || '—'}
                                </span>
                                <span className="block text-[10px] text-[var(--muted)] truncate">
                                  {[row.ordenServicio, row.marcaLabel || box.marcaLabel, row.modeloLabel || box.modeloLabel]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
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
                  <div className="overflow-x-auto max-h-[160px] overflow-y-auto rounded-lg border border-emerald-100 bg-[var(--surface)]">
                    <table className="w-full text-left text-[11px]">
                      <thead className="sticky top-0 bg-[var(--surface-hover)] border-b border-[var(--border)]">
                        <tr className="text-[9px] font-black uppercase tracking-wider text-[var(--muted)]">
                          <th className="px-2 py-2">Serie</th>
                          <th className="px-2 py-2">Marca</th>
                          <th className="px-2 py-2">Modelo</th>
                          <th className="px-2 py-2">Salida</th>
                          <th className="px-2 py-2 w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRows.map((row) => (
                          <tr key={row.sn} className="border-b border-[var(--border)] last:border-0">
                            <td className="px-2 py-2 font-mono font-bold text-emerald-700 whitespace-nowrap">
                              {row.sn}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">{row.marca}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{row.modelo}</td>
                            <td className="px-2 py-2 font-bold whitespace-nowrap">{row.salida}</td>
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                className="text-[var(--muted)] hover:text-red-500 text-sm font-bold"
                                onClick={() =>
                                  setSelectedSeriesForDispatch((prev) =>
                                    prev.filter((item) => normalizeSn(item) !== row.sn)
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
              <p className="text-[11px] text-[var(--muted)]">
                Para elegir series: pestaña <strong>Series específicas</strong>.
              </p>
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
            onClick={() => {
              if (confirmDisabled) return;
              setShowReview(true);
            }}
            disabled={confirmDisabled}
          >
            {dispatchAction === 'despacho' ? 'Ver series y confirmar' : 'Ver series y trasladar'}
          </Button>
        </div>
      </Card>

      {showReview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-3xl shadow-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col animate-rise-in">
            <div className="border-b border-[var(--border)] bg-emerald-600 px-5 py-4 text-white shrink-0">
              <h3 className="font-black text-lg">
                {dispatchAction === 'despacho' ? 'Series a despachar' : 'Series a trasladar'}
              </h3>
              <p className="text-xs text-white/85 mt-1">
                Caja <strong>{box.id}</strong>
                {dispatchAction === 'despacho'
                  ? ` · Conduce ${dispatchDestination || '—'}`
                  : ` · Destino ${dispatchArea || '—'}`}
                {' · '}
                {previewRows.length} equipo{previewRows.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className="p-4 overflow-y-auto min-h-0 flex-1 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-2 py-1.5">
                  <div className="text-[9px] font-black uppercase text-[var(--muted)]">Modo</div>
                  <div className="font-bold">
                    {dispatchMode === 'all' ? 'Toda la caja' : 'Series específicas'}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-2 py-1.5">
                  <div className="text-[9px] font-black uppercase text-[var(--muted)]">Cantidad</div>
                  <div className="font-bold text-emerald-700">{previewRows.length}</div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-2 py-1.5 col-span-2">
                  <div className="text-[9px] font-black uppercase text-[var(--muted)]">
                    {dispatchAction === 'despacho' ? 'Conduce de salida' : 'Área destino'}
                  </div>
                  <div className="font-bold truncate">
                    {dispatchAction === 'despacho' ? dispatchDestination || '—' : dispatchArea || '—'}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[var(--border)] max-h-[min(420px,50vh)] overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-[var(--sidebar)] text-[var(--sidebar-foreground)]">
                    <tr className="text-[9px] font-black uppercase tracking-wider">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Serie</th>
                      <th className="px-3 py-2">OS</th>
                      <th className="px-3 py-2">Marca</th>
                      <th className="px-3 py-2">Modelo</th>
                      <th className="px-3 py-2">Tecnología</th>
                      <th className="px-3 py-2">
                        {dispatchAction === 'despacho' ? 'Salida' : 'Destino'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, idx) => (
                      <tr
                        key={`${row.sn}-${idx}`}
                        className="border-b border-[var(--border)] last:border-0 odd:bg-[var(--surface)] even:bg-[var(--surface-hover)]"
                      >
                        <td className="px-3 py-2 text-[var(--muted)]">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono font-bold text-emerald-700 whitespace-nowrap">
                          {row.sn}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.os}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.marca}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.modelo}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.tecnologia}</td>
                        <td className="px-3 py-2 font-bold whitespace-nowrap">{row.salida}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {dispatchNotes.trim() && (
                <p className="text-[11px] text-[var(--muted)]">
                  <span className="font-bold text-[var(--foreground)]">Notas:</span> {dispatchNotes}
                </p>
              )}
            </div>

            <div className="p-4 border-t border-[var(--border)] flex justify-end gap-3 bg-[var(--surface-hover)] shrink-0">
              <Button
                variant="outline"
                onClick={() => setShowReview(false)}
                disabled={isDispatching}
              >
                Volver
              </Button>
              <Button
                className="bg-emerald-500 hover:bg-emerald-600 text-white border-none"
                onClick={onConfirm}
                disabled={isDispatching || confirmDisabled}
              >
                {isDispatching
                  ? 'Procesando...'
                  : dispatchAction === 'despacho'
                    ? 'Confirmar Despacho'
                    : 'Confirmar Traslado'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
});
