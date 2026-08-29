'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, DataTable, type DataTableColumn, notify, confirmDialog } from '@/components/ui';
import { AlertCircle, CheckCircle2, Cpu, Loader2, MapPin, Package, Printer, ScanLine, Tag, X } from 'lucide-react';
import { fetchBoxSeriesUi } from '@/modules/inventario/client/warehouseBoxSeries';
import { PrintBoxModal } from '@/app/(erp)/bodega/gestion/components/PrintBoxModal';
import { scrapAppendSeriesViaApi, scrapCloseBoxViaApi } from '@/lib/api/workshopTasks';
import {
  prepareScannedSerial,
  serialLengthCounterLabel,
} from '@/shared/validation/serialDigitRules';
import { printScrapBoxLabel } from './printScrapBoxLabel';

export type ScrapBoxRow = {
  id: string;
  displayId: string;
  displayIdFull: string;
  isLegacyBoxCode: boolean;
  realDbId: string;
  rack: string;
  marcaLabel: string;
  modeloLabel: string;
  techName: string;
  unitCount: number;
  capacity: number;
  status: string;
  usuarioIngreso: string;
  fechaIngreso: string;
};

type Props = {
  box: ScrapBoxRow;
  loading: boolean;
  seriesRows: unknown[];
  onClose: () => void;
  /** Tras append/cierre: refrescar filas + listado. */
  onAppendSuccess?: (next: {
    unitCount: number;
    capacity: number;
    closed: boolean;
    seriesRows: SeriesUiRow[];
  }) => void;
};

export type SeriesUiRow = {
  ordenServicio?: string;
  s1?: string;
  s2?: string;
  s3?: string;
  s4?: string;
  marcaLabel?: string;
  modeloLabel?: string;
  material?: string;
  lote?: string;
  fechaHora?: string;
};

export const ScrapBoxDetailDrawer = memo(function ScrapBoxDetailDrawer({
  box,
  loading,
  seriesRows,
  onClose,
  onAppendSuccess,
}: Props) {
  const [showPrint, setShowPrint] = useState(false);
  const [scanSN, setScanSN] = useState('');
  const [scanError, setScanError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [closing, setClosing] = useState(false);
  const [localUnitCount, setLocalUnitCount] = useState(box.unitCount);
  const [localCapacity, setLocalCapacity] = useState(box.capacity);
  const [localClosed, setLocalClosed] = useState(box.status === 'Full');
  const snRef = useRef<HTMLInputElement>(null);

  const rows = seriesRows as SeriesUiRow[];
  const equipCount = rows.length;
  const capacity = Math.max(1, Number(localCapacity) || 1);
  // Siempre priorizar filas del detalle (el listado puede venir subcontado).
  const displayUnitCount = equipCount > 0 ? equipCount : localUnitCount;
  const isPartial = !localClosed && displayUnitCount < capacity;
  const isComplete = !localClosed && displayUnitCount > 0 && displayUnitCount >= capacity;
  const remaining = Math.max(0, capacity - displayUnitCount);

  useEffect(() => {
    setLocalCapacity(box.capacity);
    setLocalClosed(box.status === 'Full');
    // No pisar un conteo real ya cargado con el valor corto del listado.
    if (seriesRows.length === 0) {
      setLocalUnitCount(box.unitCount);
    }
  }, [box.unitCount, box.capacity, box.status, box.realDbId, seriesRows.length]);

  useEffect(() => {
    if (equipCount > 0 && equipCount !== localUnitCount) {
      setLocalUnitCount(equipCount);
    }
  }, [equipCount, localUnitCount]);

  useEffect(() => {
    if (isPartial) {
      requestAnimationFrame(() => snRef.current?.focus());
    }
  }, [isPartial, box.realDbId]);

  const serialsInBox = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      for (const sn of [r.s1, r.s2, r.s3, r.s4]) {
        const u = String(sn || '').trim().toUpperCase();
        if (u) set.add(u);
      }
    }
    return set;
  }, [rows]);

  const applyCloseResult = useCallback(
    async (equipos: number, cap: number) => {
      const ui = (await fetchBoxSeriesUi(box.realDbId)) as SeriesUiRow[];
      setLocalUnitCount(equipos);
      setLocalCapacity(cap);
      setLocalClosed(true);
      onAppendSuccess?.({
        unitCount: equipos,
        capacity: cap,
        closed: true,
        seriesRows: ui,
      });
    },
    [box.realDbId, onAppendSuccess]
  );

  const handleCloseFull = useCallback(async () => {
    if (!isComplete) return;
    const ok = await confirmDialog({
      title: 'Guardar y cerrar caja',
      message: `Se cerrará ${box.displayId} con ${displayUnitCount}/${capacity} equipos. No se podrán agregar más series.`,
      tone: 'success',
      confirmText: 'Guardar / Cerrar',
    });
    if (!ok) return;
    setClosing(true);
    try {
      const result = await scrapCloseBoxViaApi({ boxId: box.realDbId });
      await applyCloseResult(result.equipos_count, result.capacity);
      notify.success(`Caja ${result.box_code} guardada y cerrada`, {
        description: `${result.equipos_count}/${result.capacity} equipos`,
      });
    } catch (err) {
      notify.error('No se pudo cerrar la caja', {
        description: err instanceof Error ? err.message : 'Error',
      });
    } finally {
      setClosing(false);
    }
  }, [isComplete, box.displayId, box.realDbId, displayUnitCount, capacity, applyCloseResult]);

  const handleCloseResize = useCallback(async () => {
    if (displayUnitCount <= 0) return;
    const ok = await confirmDialog({
      title: 'Cerrar con equipos actuales',
      message:
        `La caja declara capacidad ${capacity} pero el detalle muestra ${displayUnitCount} equipo(s).\n\n` +
        `Si ya pistoleó todo lo que corresponde, se ajustará la capacidad a ${displayUnitCount} y se cerrará como Full.\n\n` +
        `Esto evita que quede en Parcial por una capacidad declarada incorrecta.`,
      tone: 'warning',
      confirmText: `Cerrar con ${displayUnitCount} equipos`,
    });
    if (!ok) return;
    setClosing(true);
    try {
      const result = await scrapCloseBoxViaApi({
        boxId: box.realDbId,
        resizeCapacityToContents: true,
      });
      await applyCloseResult(result.equipos_count, result.capacity);
      notify.success(`Caja ${result.box_code} cerrada`, {
        description: result.resized
          ? `Capacidad ajustada a ${result.capacity} (antes declarada mayor).`
          : `${result.equipos_count}/${result.capacity} equipos`,
      });
    } catch (err) {
      notify.error('No se pudo cerrar la caja', {
        description: err instanceof Error ? err.message : 'Error',
      });
    } finally {
      setClosing(false);
    }
  }, [displayUnitCount, capacity, box.realDbId, applyCloseResult]);

  const handleScan = useCallback(async () => {
    const sn = prepareScannedSerial(scanSN);
    if (!sn) {
      setScanError('El SN es obligatorio');
      return;
    }
    if (serialsInBox.has(sn)) {
      setScanError(`Serial duplicado: "${sn}" ya está en esta caja. Debe ser único.`);
      setScanSN('');
      return;
    }

    setScanning(true);
    setScanError('');
    try {
      const result = await scrapAppendSeriesViaApi({
        boxId: box.realDbId,
        serialNumber: sn,
      });
      const ui = (await fetchBoxSeriesUi(box.realDbId)) as SeriesUiRow[];
      setLocalUnitCount(result.equipos_count);
      setLocalCapacity(result.capacity);
      setScanSN('');
      // Append nunca cierra: closed solo tras "Guardar / Cerrar caja".
      onAppendSuccess?.({
        unitCount: result.equipos_count,
        capacity: result.capacity,
        closed: false,
        seriesRows: ui,
      });
      notify.success(
        result.closed
          ? `Capacidad alcanzada · ${result.equipos_count}/${result.capacity} — pulse Guardar para cerrar`
          : `Equipo agregado · ${result.equipos_count}/${result.capacity}`,
        {
          description: result.slots.s1
            ? `S1 (SAP): ${result.slots.s1}${result.slots.s2 ? ` · S2: ${result.slots.s2}` : ''}`
            : undefined,
        }
      );
      requestAnimationFrame(() => snRef.current?.focus());
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'No se pudo agregar el equipo');
    } finally {
      setScanning(false);
    }
  }, [scanSN, serialsInBox, box.realDbId, onAppendSuccess]);

  const columns = useMemo((): DataTableColumn<SeriesUiRow>[] => {
    return [
      {
        id: 'os',
        header: 'OS',
        width: '100px',
        cell: (item) => (
          <span className="text-[10px] font-black text-[var(--accent)]">{item.ordenServicio || '—'}</span>
        ),
      },
      {
        id: 's1',
        header: 'S1 (SAP)',
        width: '140px',
        cell: (item) => (
          <span className="font-mono text-[10px] font-black text-[var(--heading)]">{item.s1 || '—'}</span>
        ),
      },
      {
        id: 's2',
        header: 'S2',
        width: '130px',
        cell: (item) => <span className="font-mono text-[10px]">{item.s2 || '—'}</span>,
      },
      {
        id: 's3',
        header: 'S3',
        width: '130px',
        cell: (item) => <span className="font-mono text-[10px]">{item.s3 || '—'}</span>,
      },
      {
        id: 's4',
        header: 'S4',
        width: '130px',
        cell: (item) => <span className="font-mono text-[10px]">{item.s4 || '—'}</span>,
      },
      {
        id: 'modelo',
        header: 'Modelo',
        width: '140px',
        cell: (item) => (
          <span className="text-[10px] font-bold">
            {[item.marcaLabel, item.modeloLabel].filter(Boolean).join(' ') || '—'}
          </span>
        ),
      },
      {
        id: 'material',
        header: 'Material',
        width: '90px',
        cell: (item) => <span className="text-[10px]">{item.material || '—'}</span>,
      },
      {
        id: 'lote',
        header: 'Valoración',
        width: '90px',
        cell: (item) => <span className="text-[10px]">{item.lote || '—'}</span>,
      },
      {
        id: 'fecha',
        header: 'Ingreso',
        width: '140px',
        cell: (item) => <span className="text-[10px] text-[var(--muted)]">{item.fechaHora || '—'}</span>,
      },
    ];
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-sm">
        <div className="flex h-full w-full max-w-5xl flex-col bg-[var(--surface)] shadow-2xl animate-slide-in-right">
          <div className="border-b border-[var(--border)] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="red">{box.displayId}</Badge>
                  {box.isLegacyBoxCode && (
                    <Badge variant="yellow" className="text-[8px] font-black">
                      LEGACY
                    </Badge>
                  )}
                  <Badge variant="red" className="text-[8px] font-black">
                    SCRAP
                  </Badge>
                  {localClosed ? (
                    <Badge variant="green" className="text-[8px] font-black">
                      COMPLETA
                    </Badge>
                  ) : isComplete ? (
                    <Badge variant="green" className="text-[8px] font-black">
                      LISTA · Guardar para cerrar
                    </Badge>
                  ) : isPartial ? (
                    <Badge variant="yellow" className="text-[8px] font-black">
                      PARCIAL · Faltan {remaining}
                    </Badge>
                  ) : (
                    <Badge variant="slate" className="text-[8px] font-black">
                      VACÍA
                    </Badge>
                  )}
                </div>
                <h2 className="text-xl font-black text-[var(--heading)]">
                  Detalle inventario SCRAPS · {box.marcaLabel} {box.modeloLabel}
                </h2>
                <div className="mt-2 flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1">
                    <Cpu className="h-3 w-3 text-rose-500" /> {box.techName}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-rose-500" /> {box.rack}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-1.5 py-0.5 font-black text-sky-900 dark:bg-sky-950 dark:text-sky-200"
                    title="Conteo = filas del inventario (no el listado)"
                  >
                    <Package className="h-3 w-3" /> {rows.length > 0 ? rows.length : localUnitCount}/
                    {capacity} EQUIPOS
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowPrint(true)}
                >
                  <Printer className="h-4 w-4 text-rose-600" />
                  Imprimir etiqueta
                </Button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--surface-hover)]"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <Card className="mt-4 border-2 border-rose-200/70 bg-rose-50/60 p-4 dark:border-rose-900/40 dark:bg-rose-950/30">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-900/50">
                  <Tag className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-rose-600">
                    Captura de caja / Nº de etiqueta
                  </p>
                  <p className="font-mono text-xl font-black text-[var(--heading)]">{box.displayId}</p>
                  <p className="text-[10px] text-[var(--muted)]">
                    Código operativo: {box.id} · Usuario: {box.usuarioIngreso.split('@')[0]} ·{' '}
                    {box.fechaIngreso}
                  </p>
                </div>
              </div>
            </Card>

            {isPartial && (
              <Card className="mt-4 border-2 border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="mb-3 flex items-center gap-2">
                  <ScanLine className="h-4 w-4 text-amber-600" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                    Completar caja · pistolee equipos en cola SCRAP · series únicas
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label className="mb-1 block text-[10px] font-black uppercase text-slate-500">
                      SN / Serie
                    </label>
                    <input
                      ref={snRef}
                      type="text"
                      autoFocus
                      disabled={scanning || closing}
                      value={scanSN}
                      onChange={(e) => {
                        setScanSN(e.target.value);
                        setScanError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (!scanning && !closing) void handleScan();
                        }
                      }}
                      placeholder="Escanear SN único (S1–S4; S1 = SAP)…"
                      className="h-12 w-full rounded-xl border-2 border-amber-200 bg-white px-4 font-mono text-sm font-bold uppercase outline-none focus:border-amber-500"
                    />
                    <div className="mt-1 flex justify-between">
                      <span className="text-[10px] font-bold text-amber-700/80">
                        Faltan {remaining} de {capacity}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">
                        {serialLengthCounterLabel(prepareScannedSerial(scanSN).length, null)}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    className="h-12 shrink-0 bg-amber-600 hover:bg-amber-700"
                    disabled={scanning || closing}
                    onClick={() => void handleScan()}
                  >
                    {scanning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Validando…
                      </>
                    ) : (
                      'Agregar (Enter)'
                    )}
                  </Button>
                </div>
                {scanError && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] font-black text-rose-600">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {scanError}
                  </p>
                )}
                {displayUnitCount > 0 && (
                  <div className="mt-4 border-t border-amber-200/80 pt-3">
                    <p className="mb-2 text-[10px] font-bold text-amber-800/90">
                      ¿Ya pistoleó todos los equipos? Si la capacidad declarada ({capacity}) quedó
                      alta por error, cierre con el conteo real ({displayUnitCount}).
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-amber-400 text-amber-900 hover:bg-amber-100"
                      disabled={closing || scanning}
                      onClick={() => void handleCloseResize()}
                    >
                      {closing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Cerrando…
                        </>
                      ) : (
                        `Cerrar con ${displayUnitCount} equipos (ajustar capacidad)`
                      )}
                    </Button>
                  </div>
                )}
              </Card>
            )}

            {isComplete && (
              <Card className="mt-4 border-2 border-emerald-300 bg-emerald-50/60 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                    Capacidad completa · {displayUnitCount}/{capacity} — confirme para cerrar
                  </p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  disabled={closing}
                  onClick={() => void handleCloseFull()}
                >
                  {closing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
                    </>
                  ) : (
                    'Guardar / Cerrar caja'
                  )}
                </Button>
              </Card>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <Card padding="none" className="overflow-hidden border border-[var(--border)]">
              <div className="border-b border-[var(--border)] bg-[var(--surface-hover)] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                  Inventario en caja · {loading ? '…' : `${rows.length} equipos`}
                  {!loading && box.unitCount !== rows.length && rows.length > 0
                    ? ` · ⚠ listado mostraba ${box.unitCount}/${capacity}`
                    : ''}
                  {' · '}
                  S1 = SAP
                </p>
              </div>
              {loading ? (
                <div className="py-16 text-center text-sm text-[var(--muted)]">Cargando series…</div>
              ) : (
                <DataTable
                  columns={columns}
                  data={rows}
                  getRowId={(item, i) => `${item.ordenServicio}-${item.s1}-${i}`}
                  rowHeight={48}
                  maxBodyHeight={520}
                  minWidth={1100}
                  compact
                  emptyMessage="No hay equipos registrados en esta caja SCRAPS."
                />
              )}
            </Card>
          </div>
        </div>
      </div>

      {showPrint && (
        <PrintBoxModal
          box={{ id: box.displayId }}
          onClose={() => setShowPrint(false)}
          onPrint={(mode) => {
            printScrapBoxLabel(
              {
                id: box.displayId,
                marca: box.marcaLabel,
                modelo: box.modeloLabel,
                tecnologia: box.techName,
                cantidad: rows.length > 0 ? rows.length : localUnitCount,
                fechaIngreso: box.fechaIngreso,
                series: rows.map((s) => ({
                  s1: s.s1,
                  s2: s.s2,
                  s3: s.s3,
                  s4: s.s4,
                  material: s.material,
                  lote: s.lote,
                })),
              },
              mode
            );
            setShowPrint(false);
          }}
        />
      )}
    </>
  );
});

export async function loadScrapBoxSeries(boxId: string): Promise<SeriesUiRow[]> {
  try {
    return (await fetchBoxSeriesUi(boxId)) as SeriesUiRow[];
  } catch (err) {
    notify.error('No se pudo cargar el detalle SCRAPS', {
      description: err instanceof Error ? err.message : 'Error de conexión',
    });
    return [];
  }
}
