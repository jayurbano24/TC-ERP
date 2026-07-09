'use client';

import { memo } from 'react';
import { Card, Button } from '@/components/ui';
import { RotateCcw, X } from 'lucide-react';

type Props = {
  item: any;
  returnTargetStage: string;
  setReturnTargetStage: (v: string) => void;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * C1: modal "Mover Equipo de Etapa" extraído del monolito produccion/taller y memoizado.
 * El estado/handler vive en el padre.
 */
export const ReturnStageModal = memo(function ReturnStageModal({
  item,
  returnTargetStage,
  setReturnTargetStage,
  loading,
  onClose,
  onConfirm,
}: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
      <Card className="max-w-md w-full max-h-[92dvh] shadow-2xl animate-rise-in p-0 overflow-hidden flex flex-col rounded-t-[1.75rem] sm:rounded-3xl my-0 sm:my-4">
        <div className="p-4 sm:p-6 bg-amber-500 text-white flex justify-between items-center gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <RotateCcw className="w-5 h-5 text-amber-100 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-black text-base sm:text-lg truncate">Mover Equipo de Etapa</h3>
              <p className="text-[10px] font-bold text-amber-100 uppercase tracking-widest mt-0.5">Selecciona el nuevo destino</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white transition-colors shrink-0" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 sm:p-6 space-y-6 bg-slate-50 overflow-y-auto flex-1 min-h-0">
          <p className="text-xs font-bold text-slate-600">
            Selecciona a qué etapa deseas mover el equipo <span className="font-black text-[#181c3a] break-all">{item?.sn}</span>:
          </p>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Etapa de Destino <span className="text-rose-500">*</span></label>
            <select value={returnTargetStage} onChange={e => setReturnTargetStage(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all">
              <option value="in_workshop">Diagnóstico</option>
              <option value="in_qc">Reparación</option>
              <option value="in_refurbish">Reacondicionado</option>
              <option value="in_control_warehouse">L3 (Avanzado)</option>
              <option value="irreparable">SCRAPS</option>
            </select>
          </div>
          <Button
            variant="primary"
            disabled={!returnTargetStage || loading}
            className="w-full bg-[#181c3a] hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 text-white shadow-lg py-4 font-black mt-2 disabled:shadow-none"
            onClick={onConfirm}
          >
            {loading ? 'Moviendo...' : 'Confirmar Movimiento'}
          </Button>
        </div>
      </Card>
    </div>
  );
});
