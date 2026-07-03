'use client';

import { memo, type FormEvent } from 'react';
import { Card, Button } from '@/components/ui';
import { ArrowLeftRight, Loader2, QrCode } from 'lucide-react';
import { WORKSHOP_TRANSFER_BATCH_LIMIT } from '@/modules/inventario/client/warehouseBoxes';

type Props = {
  inventory: any[];
  catMarcas: any[];
  catModelos: any[];
  selectedBoxesForTransfer: string[];
  setSelectedBoxesForTransfer: (v: string[]) => void;
  transferScanInput: string;
  setTransferScanInput: (v: string) => void;
  destinationArea: string;
  setDestinationArea: (v: string) => void;
  onScanSubmit: (e: FormEvent) => void;
  onExecute: () => void;
  onClose: () => void;
  executing?: boolean;
};

/**
 * C1: modal de transferencia masiva extraído del monolito bodega/gestion y memoizado.
 * El estado vive en el padre; aquí solo se reciben datos + setters/callbacks.
 */
export const TransferModal = memo(function TransferModal({
  inventory,
  catMarcas,
  catModelos,
  selectedBoxesForTransfer,
  setSelectedBoxesForTransfer,
  transferScanInput,
  setTransferScanInput,
  destinationArea,
  setDestinationArea,
  onScanSubmit,
  onExecute,
  onClose,
  executing = false,
}: Props) {
  const isWorkshopDest = destinationArea === 'Diagnóstico';
  const selectionCount = selectedBoxesForTransfer.length;
  const autoBatchCount =
    isWorkshopDest && selectionCount > 0
      ? Math.ceil(selectionCount / WORKSHOP_TRANSFER_BATCH_LIMIT)
      : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-6">
      <Card className="max-w-2xl w-full shadow-2xl animate-rise-in p-0 overflow-hidden">
        <div className="bg-[#181c3a] p-6 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <ArrowLeftRight className="w-6 h-6 text-[#2ec4f1]" />
            <h3 className="text-xl font-bold uppercase tracking-tight">Transferencia Masiva de Cajas</h3>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white">✕</button>
        </div>

        <div className="p-8 space-y-8">
          {/* Pistoleo de Cajas */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">1. PISTOLÉE LAS CAJAS A MOVER</label>
              <span className="text-[10px] font-bold text-[#2ec4f1] animate-pulse">MODO ESCÁNER ACTIVO</span>
            </div>
            <form onSubmit={onScanSubmit} className="relative group">
              <QrCode className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-[#2ec4f1] group-focus-within:scale-110 transition-transform" />
              <input
                type="text"
                autoFocus
                placeholder="ESCANEÉ ID DE CAJA (EJ: BOX-001)..."
                className="w-full h-20 pl-16 pr-6 bg-slate-50 border-2 border-slate-100 rounded-3xl text-2xl font-mono font-black outline-none focus:border-[#2ec4f1] focus:bg-white transition-all uppercase shadow-inner"
                value={transferScanInput}
                onChange={e => setTransferScanInput(e.target.value)}
              />
            </form>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selección Actual ({selectedBoxesForTransfer.length})</label>
            <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {inventory.map(box => {
                const marcaStr = catMarcas.find((m: any) => m.id === (box.marca || box.brand_id))?.name || 'S/M';
                const modeloStr = catModelos.find((m: any) => m.id === (box.modelo || box.model_id))?.name || '';
                const boxCode = box.box_code || box.id;
                const rackLoc = box.rack_location || box.rack || 'Sin Rack';

                return (
                  <div
                    key={box.id}
                    onClick={() => {
                      if (selectedBoxesForTransfer.includes(box.id)) {
                        setSelectedBoxesForTransfer(selectedBoxesForTransfer.filter(id => id !== box.id));
                      } else {
                        setSelectedBoxesForTransfer([...selectedBoxesForTransfer, box.id]);
                      }
                    }}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${selectedBoxesForTransfer.includes(box.id) ? 'border-[#2ec4f1] bg-[#2ec4f1]/5' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                  >
                    <div>
                      <p className="text-sm font-black text-[#181c3a]">{boxCode}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">{marcaStr} {modeloStr} • {rackLoc}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedBoxesForTransfer.includes(box.id) ? 'bg-[#2ec4f1] border-[#2ec4f1]' : 'border-slate-200'}`}>
                      {selectedBoxesForTransfer.includes(box.id) && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">2. Área de Destino</label>
              <div className="grid grid-cols-2 gap-2">
                {['Bodega Central', 'Bodega SCRAP', 'Bodega Obsoleto', 'Diagnóstico'].map(area => (
                  <button
                    key={area}
                    onClick={() => setDestinationArea(area)}
                    className={`px-4 py-3 rounded-xl border-2 font-bold text-[10px] uppercase transition-all text-left flex items-center justify-between ${destinationArea === area ? 'border-[#2ec4f1] bg-[#2ec4f1]/5 text-[#181c3a]' : 'border-slate-100 text-slate-400 hover:border-slate-200'}`}
                  >
                    {area}
                    {destinationArea === area && <div className="w-2 h-2 bg-[#2ec4f1] rounded-full" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isWorkshopDest && selectionCount > WORKSHOP_TRANSFER_BATCH_LIMIT && (
            <p className="text-xs text-[#2ec4f1] font-bold bg-[#2ec4f1]/10 border border-[#2ec4f1]/30 rounded-xl px-4 py-3">
              {selectionCount} cajas → se ejecutarán <strong>{autoBatchCount} lotes</strong> automáticos
              (hasta {WORKSHOP_TRANSFER_BATCH_LIMIT} cajas por lote). Un solo clic.
            </p>
          )}

          <div className="flex gap-4 pt-4">
            <Button variant="outline" className="flex-1 h-14 font-black uppercase tracking-widest text-[10px]" onClick={onClose} disabled={executing}>Cancelar</Button>
            <Button
              variant="primary"
              className="flex-1 h-14 font-black uppercase tracking-widest text-[10px] bg-[#181c3a]"
              onClick={onExecute}
              disabled={selectionCount === 0 || executing}
              leftIcon={executing ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            >
              {executing
                ? autoBatchCount > 1
                  ? `Transfiriendo (${autoBatchCount} lotes)...`
                  : 'Transfiriendo...'
                : `Ejecutar movimiento (${selectionCount}${autoBatchCount > 1 ? ` · ${autoBatchCount} lotes` : ''})`}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
});
