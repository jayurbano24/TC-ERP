'use client';

import { memo, type FormEvent } from 'react';
import { Card, Badge, Button, confirmDialog } from '@/components/ui';
import { Box, QrCode, Trash2 } from 'lucide-react';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-6">
      <Card className={`${newBoxStep === 'scanning' ? 'max-w-5xl' : 'max-w-lg'} w-full shadow-2xl animate-rise-in p-0 overflow-hidden transition-all duration-500`}>
        <div className="bg-[#181c3a] p-6 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Box className="w-6 h-6 text-[#2ec4f1]" />
            <h3 className="text-xl font-bold flex items-center gap-3">
              {newBoxStep === 'scanning' && newBox.correlativo
                ? newBox.correlativo
                : 'Ingresar Almacén TC Caja'}
              {newBoxStep === 'scanning' && newBox.correlativo && (
                <Badge variant="outline" className="bg-white/10 text-white border-white/20 text-[10px] tracking-widest">EN PROCESO</Badge>
              )}
            </h3>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white">✕</button>
        </div>

        {newBoxStep === 'form' ? (
          <div className="p-8 space-y-6">
            {/* Número de correlativo de la caja (Auto-generado y No Editable) */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Número de correlativo de la caja (Auto-generado)</label>
              <input
                type="text"
                className="w-full bg-slate-100 p-3 rounded-xl border border-slate-200 font-bold text-sm outline-none text-slate-500 cursor-not-allowed"
                value={newBox.correlativo}
                disabled
                placeholder="Se asigna al pulsar «Siguiente»"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tecnología</label>
                <select
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:border-[#2ec4f1]"
                  value={newBox.tecnologia}
                  onChange={e => setNewBox({ ...newBox, tecnologia: e.target.value, marca: '', modelo: '' })}
                >
                  <option value="">-- Seleccione --</option>
                  {catTecnologias.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Marca</label>
                <select
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:border-[#2ec4f1]"
                  value={newBox.marca}
                  onChange={e => setNewBox({ ...newBox, marca: e.target.value, modelo: '' })}
                  disabled={!newBox.tecnologia}
                >
                  <option value="">-- Seleccione --</option>
                  {catMarcas.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Modelo</label>
                <select
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:border-[#2ec4f1]"
                  value={newBox.modelo}
                  onChange={e => setNewBox({ ...newBox, modelo: e.target.value })}
                  disabled={!newBox.marca}
                >
                  <option value="">-- Seleccione --</option>
                  {catModelos
                    .filter(m =>
                      (!newBox.tecnologia || m.technology_id === newBox.tecnologia) &&
                      (!newBox.marca || m.brand_id === newBox.marca)
                    )
                    .map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))
                  }
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cantidad</label>
                <input
                  type="number"
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:border-[#2ec4f1]"
                  value={newBox.cantidad || ''}
                  onChange={e => setNewBox({ ...newBox, cantidad: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={onNext}
                disabled={!canProceedToScan}
              >
                {loading ? 'Validando...' : 'Siguiente: Cargar Series'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            <div className="flex gap-6 h-[500px]">
              {/* Columna Izquierda: Formulario y Progreso */}
              <div className="flex-1 flex flex-col gap-6">
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shrink-0">
                  <div className="flex justify-between items-end mb-4">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">Progreso de la Caja</span>
                      <h4 className="text-lg font-black text-[#181c3a]">
                        {catMarcas.find(b => b.id === newBox.marca)?.name || newBox.marca || '—'}{' '}
                        {catModelos.find(m => m.id === newBox.modelo)?.name || newBox.modelo || '—'}
                      </h4>
                    </div>
                    <div className="text-right">
                      <span className={`text-2xl font-black leading-none ${tempSerials.length > 0 ? 'text-emerald-500' : 'text-[#2ec4f1]'}`}>
                        {tempSerials.length}
                        <span className="text-sm text-slate-300"> / {newBox.cantidad}</span>
                      </span>
                      {tempSerials.length > 0 && tempSerials.length < newBox.cantidad && (
                        <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mt-0.5">
                          Faltan {newBox.cantidad - tempSerials.length}
                        </p>
                      )}
                      {tempSerials.length >= newBox.cantidad && (
                        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mt-0.5">
                          ✓ Completo
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#2ec4f1] transition-all duration-500"
                      style={{ width: `${(tempSerials.length / newBox.cantidad) * 100}%` }}
                    />
                  </div>
                </div>

                <form onSubmit={onScanSubmit} className="relative group shrink-0">
                  <QrCode className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-200 group-focus-within:text-[#2ec4f1] transition-colors" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="PISTOLÉE SERIE (SN)..."
                    className="w-full h-20 pl-16 pr-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-2xl font-mono font-black outline-none focus:border-[#2ec4f1] focus:bg-white transition-all uppercase"
                    value={currentSN}
                    onChange={e => setCurrentSN(e.target.value)}
                  />
                </form>

                <div className="flex gap-4 pt-4 mt-auto shrink-0">
                  <Button variant="outline" className="flex-1" onClick={() => setNewBoxStep('form')}>Atrás</Button>
                  <Button
                    variant="primary"
                    className={`flex-1 border-none shadow-xl transition-all ${
                      tempSerials.length === 0
                        ? 'bg-slate-300 shadow-slate-200/20 cursor-not-allowed'
                        : tempSerials.length >= newBox.cantidad
                        ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'
                        : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'
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
                      : `Guardar Caja (${tempSerials.length})`
                    }
                  </Button>
                </div>
              </div>

              {/* Columna Derecha: Lista de Escaneados */}
              <div className="w-[45%] bg-slate-50 rounded-3xl border border-slate-100 p-5 flex flex-col">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4 shrink-0">Contenido de la Caja</h4>

                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                  {/* Se renderizan en reversa para ver el ultimo escaneado arriba */}
                  {[...tempSerials].reverse().map((s, index) => {
                    const originalIndex = tempSerials.length - 1 - index;
                    return (
                      <div key={originalIndex} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-[#2ec4f1]/30 transition-colors animate-rise-in group">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-black shrink-0">
                            {originalIndex + 1}
                          </div>
                          <Badge variant="green" className="bg-emerald-500 text-white text-[9px] py-0.5 px-1.5 shrink-0">OK (SN)</Badge>
                          <span className="text-[11px] font-mono font-black text-[#181c3a] break-all">{s.sn}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-bold text-slate-400 truncate max-w-[60px]" title={s.recibio}>{s.recibio || 'Admin'}</span>
                          <button
                            onClick={async () => {
                              if (await confirmDialog({ title: 'Eliminar serie', message: `¿Eliminar la serie ${s.sn} de la caja actual?`, tone: 'error', confirmText: 'Eliminar' })) {
                                setTempSerials(tempSerials.filter((_, i) => i !== originalIndex));
                              }
                            }}
                            className="text-slate-300 hover:text-rose-500 p-1 transition-colors"
                            title="Eliminar de la caja"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {tempSerials.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 opacity-50">
                      <Box size={40} />
                      <p className="text-[10px] font-black uppercase tracking-widest">Caja Vacía</p>
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
