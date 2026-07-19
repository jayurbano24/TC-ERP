'use client';

import { memo, useEffect, useMemo, type FormEvent } from 'react';
import { Card, Button } from '@/components/ui';
import { ArrowLeftRight, Loader2, QrCode } from 'lucide-react';
import {
  WORKSHOP_TRANSFER_BATCH_LIMIT,
  availableWarehouseDestinations,
  resolveInventoryBoxOriginArea,
} from '@/modules/inventario/client/warehouseBoxes';

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

  const excludedOrigins = useMemo(() => {
    const origins = new Set<string>();
    for (const boxId of selectedBoxesForTransfer) {
      const box = inventory.find((b) => b.id === boxId);
      if (!box) continue;
      const origin = resolveInventoryBoxOriginArea(box);
      if (origin) origins.add(origin);
    }
    return origins;
  }, [inventory, selectedBoxesForTransfer]);

  const destinationOptions = useMemo(
    () => availableWarehouseDestinations(excludedOrigins),
    [excludedOrigins]
  );

  useEffect(() => {
    if (destinationOptions.length === 0) return;
    if (!destinationOptions.includes(destinationArea)) {
      setDestinationArea(destinationOptions[0]);
    }
  }, [destinationOptions, destinationArea, setDestinationArea]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6">
      <Card className="max-w-2xl w-full shadow-2xl animate-rise-in p-0 overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/15">
              <ArrowLeftRight className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <h3 className="text-xl font-bold uppercase tracking-tight text-[var(--heading)]">Transferencia Masiva de Cajas</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]" aria-label="Cerrar">✕</button>
        </div>

        <div className="p-8 space-y-8">
          {/* Pistoleo de Cajas */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">1. PISTOLÉE LAS CAJAS A MOVER</label>
              <span className="text-[10px] font-bold text-[var(--accent)] animate-pulse">MODO ESCÁNER ACTIVO</span>
            </div>
            <form onSubmit={onScanSubmit} className="relative group">
              <QrCode className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-[var(--accent)] group-focus-within:scale-110 transition-transform" />
              <input
                type="text"
                autoFocus
                placeholder="ESCANEÉ ID DE CAJA (EJ: BOX-001)..."
                className="w-full h-20 pl-16 pr-6 bg-[var(--surface-hover)] border-2 border-[var(--border)] rounded-3xl text-2xl font-mono font-black outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all uppercase shadow-inner"
                value={transferScanInput}
                onChange={e => setTransferScanInput(e.target.value)}
              />
            </form>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">Selección Actual ({selectedBoxesForTransfer.length})</label>
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
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${selectedBoxesForTransfer.includes(box.id) ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border)]'}`}
                  >
                    <div>
                      <p className="text-sm font-black text-[var(--heading)]">{boxCode}</p>
                      <p className="text-[9px] font-bold text-[var(--muted)] uppercase">{marcaStr} {modeloStr} • {rackLoc}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedBoxesForTransfer.includes(box.id) ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)]'}`}>
                      {selectedBoxesForTransfer.includes(box.id) && <div className="w-2 h-2 bg-[var(--surface)] rounded-full" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">2. Área de Destino</label>
              <div className="grid grid-cols-2 gap-2">
                {destinationOptions.map(area => (
                  <button
                    key={area}
                    onClick={() => setDestinationArea(area)}
                    className={`px-4 py-3 rounded-xl border-2 font-bold text-[10px] uppercase transition-all text-left flex items-center justify-between ${destinationArea === area ? 'border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--heading)]' : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--border)]'}`}
                  >
                    {area}
                    {destinationArea === area && <div className="w-2 h-2 bg-[var(--accent)] rounded-full" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isWorkshopDest && selectionCount > WORKSHOP_TRANSFER_BATCH_LIMIT && (
            <p className="text-xs text-[var(--accent)] font-bold bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl px-4 py-3">
              {selectionCount} cajas → se ejecutarán <strong>{autoBatchCount} lotes</strong> automáticos
              (hasta {WORKSHOP_TRANSFER_BATCH_LIMIT} cajas por lote). Un solo clic.
            </p>
          )}

          <div className="flex gap-4 pt-4">
            <Button variant="outline" className="flex-1 h-14 font-black uppercase tracking-widest text-[10px]" onClick={onClose} disabled={executing}>Cancelar</Button>
            <Button
              variant="primary"
              className="flex-1 h-14 font-black uppercase tracking-widest text-[10px]"
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
