'use client';

import { memo } from 'react';
import { Card, Button, notify } from '@/components/ui';
import { Truck, QrCode, AlertCircle } from 'lucide-react';

type Props = {
  box: any;
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

/**
 * C1: modal de despacho/traslado extraído del monolito bodega/gestion y memoizado.
 * El estado vive en el padre; aquí solo se reciben valores + setters/callbacks.
 */
export const DispatchModal = memo(function DispatchModal({
  box,
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md shadow-2xl animate-rise-in p-0 overflow-hidden">
        <div className="bg-[#181c3a] p-5 text-white flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-lg">
            <Truck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-black text-lg">Procesar Series de Inventario</h3>
            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">{box.id}</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">
            Selecciona las series que deseas extraer. La caja quedará con las series restantes.
          </p>
          {useOutboundDispatchHex && selectedDispatchBatchId && (
            <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Lote activo: {selectedDispatchBatchNumber || selectedDispatchBatchId}
            </p>
          )}

          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setDispatchAction('despacho')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${dispatchAction === 'despacho' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
            >
              Despachar (Salida)
            </button>
            <button
              onClick={() => setDispatchAction('traslado')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${dispatchAction === 'traslado' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              Trasladar a Área
            </button>
          </div>
          <div className="space-y-2 mt-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pistolear Serie</label>
            <div className="relative">
              <QrCode className="absolute left-3 top-2.5 h-4 w-4 text-emerald-500" />
              <input
                type="text"
                placeholder="Escanea la serie aquí..."
                className="w-full bg-slate-50 pl-9 pr-3 py-2 text-sm border border-emerald-200 focus:border-emerald-500 rounded-lg outline-none transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = e.currentTarget.value.trim();
                    if (val) {
                      const exists = box.series?.find((s: any) => s.serial_number === val || s.id === val);
                      if (exists) {
                        const sn = exists.serial_number || exists.id;
                        if (!selectedSeriesForDispatch.includes(sn)) {
                          setSelectedSeriesForDispatch(prev => [...prev, sn]);
                        }
                      } else {
                        notify.warning("La serie " + val + " no pertenece a esta caja.");
                      }
                      e.currentTarget.value = '';
                    }
                  }
                }}
                autoFocus
              />
            </div>
          </div>

          {selectedSeriesForDispatch.length > 0 && (
            <div className="border border-emerald-100 bg-emerald-50/50 rounded-xl p-3 mt-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Series Escaneadas</span>
                <span className="text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">{selectedSeriesForDispatch.length} listas</span>
              </div>
              <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto">
                {selectedSeriesForDispatch.map((sn, idx) => (
                  <div key={idx} className="bg-white border border-emerald-200 text-emerald-700 text-xs font-mono font-bold px-2 py-1 rounded-md flex items-center gap-2">
                    {sn}
                    <button
                      className="text-emerald-300 hover:text-red-500 transition-colors"
                      onClick={() => setSelectedSeriesForDispatch(prev => prev.filter(item => item !== sn))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dispatchAction === 'despacho' ? (
            <>
              <div className="space-y-2 mt-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Conduce de Salida *</label>
                <input
                  type="text"
                  value={dispatchDestination}
                  readOnly
                  placeholder="Generando código..."
                  className="w-full bg-slate-100 text-slate-500 p-3 rounded-xl border border-slate-200 font-bold text-sm outline-none cursor-not-allowed"
                />
              </div>

              <div className="space-y-2 mt-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Notas Adicionales (Opcional)</label>
                <textarea
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  placeholder="Observaciones adicionales sobre el despacho..."
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-emerald-500 transition-colors"
                  rows={2}
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex gap-3 mt-4">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 leading-tight">
                  Esta acción actualizará el estado de todas las series escaneadas a "Despachado" y saldrán de esta caja.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2 mt-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Área de Destino *</label>
                <select
                  value={dispatchArea}
                  onChange={(e) => setDispatchArea(e.target.value)}
                  className="w-full bg-white text-slate-700 p-3 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="Diagnóstico">Diagnóstico</option>
                  <option value="Reparación">Reparación (Calidad)</option>
                  <option value="Bodega Central">Reacondicionado (Bodega)</option>
                  <option value="L3">L3</option>
                  <option value="Bodega SCRAP">SCRAP</option>
                  <option value="Bodega Obsoleto">Obsoleto</option>
                </select>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl flex gap-3 mt-4">
                <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0" />
                <p className="text-xs text-indigo-700 leading-tight">
                  Esta acción desvinculará las series de la caja y las moverá al área de {dispatchArea} para ser trabajadas.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isDispatching}
          >
            Cancelar
          </Button>
          <Button
            className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 border-none"
            onClick={onConfirm}
            disabled={isDispatching || !dispatchDestination.trim()}
          >
            {isDispatching ? 'Procesando...' : dispatchAction === 'despacho' ? 'Confirmar Despacho' : 'Confirmar Traslado'}
          </Button>
        </div>
      </Card>
    </div>
  );
});
