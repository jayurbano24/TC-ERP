'use client';

import React from 'react';
import { Button, Card } from '@/components/ui';
import { ChevronLeft, FileText, Package, Radio, RefreshCw } from 'lucide-react';
import type { OperationContext } from '../../operation/operationContext';
import type { OperationCategory } from '../../types';

type Props = { ctx: OperationContext };

const CATEGORY_META: Record<
  Exclude<OperationCategory, 'Equipo'>,
  { label: string; color: string; icon: React.ReactNode }
> = {
  Accesorio: { label: 'Accesorios', color: 'emerald', icon: <Package size={20} /> },
  Teléfono: { label: 'Teléfonos', color: 'amber', icon: <Radio size={20} /> },
  Devolución: { label: 'Devolución', color: 'rose', icon: <RefreshCw size={20} /> },
};

export function BulkClassifyStep({ ctx }: Props) {
  const {
    setReceptionStep,
    scannedGuides,
    category,
    returnReason,
    setReturnReason,
    returnTracking,
    setReturnTracking,
    returnCourier,
    setReturnCourier,
    selectedAgencyId,
    agencyDetails,
    setShowAgencyModal,
    isSubmitting,
    completeCurrentGuides,
    handleConfirmReturn,
  } = ctx;

  const cat = category as OperationCategory;
  const meta = cat !== 'Equipo' ? CATEGORY_META[cat] : null;
  const isDevolucion = cat === 'Devolución';
  const isSubBodega = cat === 'Accesorio' || cat === 'Teléfono';
  const count = scannedGuides.length;

  const handleConfirm = () => {
    if (isDevolucion) {
      void handleConfirmReturn();
    } else {
      void completeCurrentGuides();
    }
  };

  const canConfirm = isDevolucion
    ? Boolean(selectedAgencyId && returnReason.trim())
    : isSubBodega
      ? Boolean(selectedAgencyId)
      : true;

  return (
    <div className="space-y-4 animate-rise-in max-w-3xl mx-auto">
      <button
        onClick={() => setReceptionStep('classification')}
        className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-[#181c3a] uppercase tracking-widest transition-all"
      >
        <ChevronLeft size={16} /> Volver a Clasificación
      </button>

      <Card className="p-6 border-none shadow-xl rounded-2xl bg-white">
        <div className="flex items-center gap-4 mb-5">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              meta?.color === 'emerald'
                ? 'bg-emerald-50 text-emerald-600'
                : meta?.color === 'amber'
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-rose-50 text-rose-600'
            }`}
          >
            {meta?.icon ?? <FileText size={20} />}
          </div>
          <div>
            <h2 className="text-lg font-black text-[#181c3a] uppercase">
              Confirmar {meta?.label ?? 'Clasificación'}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {count} caja{count !== 1 ? 's' : ''} seleccionada{count !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-3 mb-5 max-h-32 overflow-y-auto border border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Guías / Cajas</p>
          <div className="flex flex-wrap gap-1.5">
            {scannedGuides.map((g) => (
              <span
                key={g}
                className="text-[11px] font-mono font-bold text-[#181c3a] bg-white px-2 py-1 rounded border border-slate-200"
              >
                {g}
              </span>
            ))}
          </div>
        </div>

        {isDevolucion && (
          <div className="space-y-4 mb-5">
            <div
              onClick={() => setShowAgencyModal(true)}
              className="cursor-pointer hover:bg-slate-50 p-3 rounded-xl border border-slate-200 transition-all"
            >
              <p className="text-[9px] font-black text-slate-400 uppercase mb-1">
                Agencia destino <span className="text-rose-500">*</span>
              </p>
              <p className="text-sm font-black text-[#181c3a] uppercase">
                {agencyDetails
                  ? `${agencyDetails.name} — ${agencyDetails.manager || 'SIN ENCARGADO'}`
                  : 'Seleccionar agencia...'}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">Guía de envío</label>
                <input
                  type="text"
                  className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg font-bold text-xs outline-none focus:ring-2 focus:ring-rose-400"
                  placeholder="No. guía"
                  value={returnTracking}
                  onChange={(e) => setReturnTracking(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">Courier</label>
                <input
                  type="text"
                  className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg font-bold text-xs outline-none focus:ring-2 focus:ring-rose-400"
                  placeholder="Ej. Guatex"
                  value={returnCourier}
                  onChange={(e) => setReturnCourier(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {isSubBodega && (
          <div className="mb-5">
            <div
              onClick={() => setShowAgencyModal(true)}
              className="cursor-pointer hover:bg-slate-50 p-3 rounded-xl border border-slate-200 transition-all"
            >
              <p className="text-[9px] font-black text-slate-400 uppercase mb-1">
                Agencia de origen (CAC) <span className={meta?.color === 'emerald' ? 'text-emerald-500' : 'text-amber-500'}>*</span>
              </p>
              <p className="text-sm font-black text-[#181c3a] uppercase">
                {agencyDetails
                  ? `${agencyDetails.name} — ${agencyDetails.manager || 'SIN ENCARGADO'}`
                  : 'Seleccionar agencia...'}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[9px] font-black text-slate-400 uppercase">
            Comentarios{isDevolucion ? ' / Motivo' : ''}
            {isDevolucion && <span className="text-rose-500 ml-1">*</span>}
          </label>
          <textarea
            className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-[#181c3a] outline-none focus:ring-2 focus:ring-[#2ec4f1] min-h-[80px]"
            placeholder={
              isDevolucion
                ? 'Motivo de la devolución...'
                : 'Comentarios opcionales sobre la clasificación...'
            }
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
          />
        </div>

        <div className="flex gap-3 mt-5">
          <Button
            variant="outline"
            className="flex-1 h-11 rounded-xl font-black uppercase text-[10px]"
            onClick={() => setReceptionStep('classification')}
          >
            Cancelar
          </Button>
          <Button
            className={`flex-[2] h-11 rounded-xl font-black uppercase text-[10px] text-white ${
              meta?.color === 'emerald'
                ? 'bg-emerald-500 hover:bg-emerald-600'
                : meta?.color === 'amber'
                  ? 'bg-amber-500 hover:bg-amber-600'
                  : 'bg-rose-500 hover:bg-rose-600'
            } ${isSubmitting || !canConfirm ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={handleConfirm}
            disabled={isSubmitting || !canConfirm}
          >
            {isSubmitting ? 'Procesando...' : `Confirmar ${count} caja${count !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </Card>
    </div>
  );
}
