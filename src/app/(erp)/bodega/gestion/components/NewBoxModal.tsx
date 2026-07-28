'use client';

import { memo, useMemo, type FormEvent } from 'react';
import { Card, Badge, Button, confirmDialog } from '@/components/ui';
import { erpFieldClass, erpLabelClass } from '@/lib/design/tokens';
import { Box, QrCode, Trash2 } from 'lucide-react';
import {
  filterBrandsByTechnologyId,
  filterModelsByTechAndBrand,
} from '@/shared/catalogs/cascadeCatalogFilters';

type Props = {
  newBox: any;
  setNewBox: (updater: any) => void;
  newBoxStep: string;
  setNewBoxStep: (v: 'form' | 'scanning') => void;
  catTecnologias: any[];
  catMarcas: any[];
  catModelos: any[];
  loading: boolean;
  tempSerials: any[];
  setTempSerials: (v: any[]) => void;
  currentSN: string;
  setCurrentSN: (v: string) => void;
  isSavingNewBox: boolean;
  onScanSubmit: (e: FormEvent) => void;
  onAddBox: () => void;
  onNext: () => void;
  onClose: () => void;
};

/**
 * C1: modal "Nueva Caja" (alta + pistoleo de series) extraído del monolito
 * bodega/gestion y memoizado. El estado/handlers viven en el padre.
 */
export const NewBoxModal = memo(function NewBoxModal({
  newBox,
  setNewBox,
  newBoxStep,
  setNewBoxStep,
  catTecnologias,
  catMarcas,
  catModelos,
  loading,
  tempSerials,
  setTempSerials,
  currentSN,
  setCurrentSN,
  isSavingNewBox,
  onScanSubmit,
  onAddBox,
  onNext,
  onClose,
}: Props) {
  const canProceedToScan =
    Boolean(newBox.tecnologia && newBox.marca && newBox.modelo && newBox.cantidad > 0) && !loading;

  const brandOptions = useMemo(
    () => filterBrandsByTechnologyId(catMarcas, catModelos, newBox.tecnologia),
    [catMarcas, catModelos, newBox.tecnologia]
  );
  const modelOptions = useMemo(
    () => filterModelsByTechAndBrand(catModelos, newBox.tecnologia, newBox.marca),
    [catModelos, newBox.tecnologia, newBox.marca]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
      <Card
        className={`${newBoxStep === 'scanning' ? 'max-w-5xl' : 'max-w-lg'} w-full animate-rise-in overflow-hidden border border-[var(--border)] p-0 shadow-2xl transition-all duration-500`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/15">
              <Box className="h-5 w-5 text-[var(--accent)]" />
            </div>
            <h3 className="flex items-center gap-3 text-xl font-bold text-[var(--heading)]">
              {newBoxStep === 'scanning' ? 'Cargar series' : 'Ingresar Almacén TC Caja'}
              {newBoxStep === 'scanning' && (
                <Badge variant="outline" className="text-[10px] tracking-widest">
                  EN PROCESO
                </Badge>
              )}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {newBoxStep === 'form' ? (
          <div className="space-y-6 p-8">
            <div className="space-y-2">
              <label className={erpLabelClass}>Número de correlativo de la caja (Auto-generado)</label>
              <input
                type="text"
                className={`${erpFieldClass} cursor-not-allowed text-[var(--muted)]`}
                value={newBox.correlativo}
                disabled
                placeholder="TMP al primer escaneo · BOX al finalizar"
              />
              <p className="text-[10px] font-medium text-[var(--muted)]">
                Cada serie se guarda en el servidor al pistolear. Si se va la luz, reanude desde «Cajas en
                Proceso».
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className={erpLabelClass}>Tecnología</label>
                <select
                  className={erpFieldClass}
                  value={newBox.tecnologia}
                  onChange={(e) =>
                    setNewBox({ ...newBox, tecnologia: e.target.value, marca: '', modelo: '' })
                  }
                >
                  <option value="">-- Seleccione --</option>
                  {catTecnologias.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className={erpLabelClass}>Marca</label>
                <select
                  className={erpFieldClass}
                  value={newBox.marca}
                  onChange={(e) => setNewBox({ ...newBox, marca: e.target.value, modelo: '' })}
                  disabled={!newBox.tecnologia}
                >
                  <option value="">-- Seleccione --</option>
                  {brandOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className={erpLabelClass}>Modelo</label>
                <select
                  className={erpFieldClass}
                  value={newBox.modelo}
                  onChange={(e) => setNewBox({ ...newBox, modelo: e.target.value })}
                  disabled={!newBox.marca}
                >
                  <option value="">-- Seleccione --</option>
                  {modelOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className={erpLabelClass}>Cantidad</label>
                <input
                  type="number"
                  className={erpFieldClass}
                  value={newBox.cantidad || ''}
                  onChange={(e) => setNewBox({ ...newBox, cantidad: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>
              <Button variant="primary" className="flex-1" onClick={onNext} disabled={!canProceedToScan}>
                {loading ? 'Validando...' : 'Siguiente: Cargar Series'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 p-6">
            <div className="flex h-[500px] gap-6">
              <div className="flex flex-1 flex-col gap-6">
                <div
                  className="shrink-0 rounded-3xl border border-[var(--border)] p-6"
                  style={{ backgroundColor: 'var(--surface-hover)' }}
                >
                  <div className="mb-4 flex items-end justify-between">
                    <div>
                      <span className={`${erpLabelClass} leading-none`}>Progreso de la Caja</span>
                      <p className="mt-1 text-[10px] font-bold text-[var(--muted)]">
                        {newBox.correlativo
                          ? `Sesión: ${newBox.correlativo} (guardada en servidor)`
                          : 'Se crea TMP al primer escaneo · BOX al finalizar'}
                      </p>
                      <h4 className="text-lg font-black text-[var(--heading)]">
                        {catMarcas.find((b) => b.id === newBox.marca)?.name || newBox.marca || '—'}{' '}
                        {catModelos.find((m) => m.id === newBox.modelo)?.name || newBox.modelo || '—'}
                      </h4>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-2xl leading-none font-black ${
                          tempSerials.length > 0 ? 'text-[var(--success)]' : 'text-[var(--accent)]'
                        }`}
                      >
                        {tempSerials.length}
                        <span className="text-sm text-[var(--muted)]"> / {newBox.cantidad}</span>
                      </span>
                      {tempSerials.length > 0 && tempSerials.length < newBox.cantidad && (
                        <p className="mt-0.5 text-[9px] font-black tracking-widest text-[var(--warning)] uppercase">
                          Faltan {newBox.cantidad - tempSerials.length}
                        </p>
                      )}
                      {tempSerials.length >= newBox.cantidad && (
                        <p className="mt-0.5 text-[9px] font-black tracking-widest text-[var(--success)] uppercase">
                          ✓ Completo
                        </p>
                      )}
                    </div>
                  </div>
                  <div
                    className="h-2.5 w-full overflow-hidden rounded-full"
                    style={{ backgroundColor: 'var(--border)' }}
                  >
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${(tempSerials.length / newBox.cantidad) * 100}%`,
                        backgroundColor: 'var(--accent)',
                      }}
                    />
                  </div>
                </div>

                <form onSubmit={onScanSubmit} className="group relative shrink-0">
                  <QrCode className="absolute top-1/2 left-6 h-6 w-6 -translate-y-1/2 text-[var(--muted)] transition-colors group-focus-within:text-[var(--accent)]" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="PISTOLÉE SERIE (SN)..."
                    className="h-20 w-full rounded-2xl border-2 border-[var(--border)] bg-[var(--surface-hover)] pr-6 pl-16 font-mono text-2xl font-black text-[var(--foreground)] uppercase outline-none transition-all focus:border-[var(--accent)] focus:bg-[var(--surface)]"
                    value={currentSN}
                    onChange={(e) => setCurrentSN(e.target.value)}
                  />
                </form>

                <div className="mt-auto flex shrink-0 gap-4 pt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setNewBoxStep('form')}>
                    Atrás
                  </Button>
                  <Button
                    variant="primary"
                    className={`flex-1 border-none shadow-xl transition-all ${
                      tempSerials.length === 0
                        ? 'cursor-not-allowed opacity-50'
                        : tempSerials.length >= newBox.cantidad
                          ? '!bg-[var(--success)]'
                          : '!bg-[var(--warning)] !text-[var(--accent-foreground)]'
                    }`}
                    onClick={onAddBox}
                    disabled={tempSerials.length === 0 || isSavingNewBox}
                  >
                    {isSavingNewBox
                      ? 'Guardando...'
                      : tempSerials.length === 0
                        ? 'Pistolee 1 serie'
                        : tempSerials.length >= newBox.cantidad
                          ? '✓ Finalizar Caja'
                          : `Guardar Caja (${tempSerials.length})`}
                  </Button>
                </div>
              </div>

              <div
                className="flex w-[45%] flex-col rounded-3xl border border-[var(--border)] p-5"
                style={{ backgroundColor: 'var(--surface-hover)' }}
              >
                <h4 className={`${erpLabelClass} mb-4 shrink-0`}>Contenido de la Caja</h4>

                <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto pr-2">
                  {[...tempSerials].reverse().map((s, index) => {
                    const originalIndex = tempSerials.length - 1 - index;
                    return (
                      <div
                        key={originalIndex}
                        className="group flex items-center justify-between rounded-xl border border-[var(--border)] p-3 transition-colors animate-rise-in hover:border-[var(--accent)]/40"
                        style={{ backgroundColor: 'var(--surface)' }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--success)]/15 text-[10px] font-black text-[var(--success)]">
                            {originalIndex + 1}
                          </div>
                          <Badge variant="green" className="shrink-0 px-1.5 py-0.5 text-[9px]">
                            OK (SN)
                          </Badge>
                          <span className="break-all font-mono text-[11px] font-black text-[var(--foreground)]">
                            {s.sn}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className="max-w-[60px] truncate text-[10px] font-bold text-[var(--muted)]"
                            title={s.recibio}
                          >
                            {s.recibio || 'Admin'}
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              if (
                                await confirmDialog({
                                  title: 'Eliminar serie',
                                  message: `¿Eliminar la serie ${s.sn} de la caja actual?`,
                                  tone: 'error',
                                  confirmText: 'Eliminar',
                                })
                              ) {
                                setTempSerials(tempSerials.filter((_, i) => i !== originalIndex));
                              }
                            }}
                            className="p-1 text-[var(--muted)] transition-colors hover:text-[var(--danger)]"
                            title="Eliminar de la caja"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {tempSerials.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--muted)] opacity-50">
                      <Box size={40} />
                      <p className="text-[10px] font-black tracking-widest uppercase">Sin series aún</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
});
