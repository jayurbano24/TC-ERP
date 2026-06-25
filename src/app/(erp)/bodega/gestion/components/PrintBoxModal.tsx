'use client';

import { memo } from 'react';
import { Card, Button } from '@/components/ui';
import { Printer, QrCode, X } from 'lucide-react';

type Props = {
  box: any;
  onClose: () => void;
  onPrint: (mode: 'simple' | 'master') => void;
};

/**
 * C1: modal de impresión extraído del monolito bodega/gestion y memoizado.
 * El estado vive en el padre; aquí solo se reciben datos + callbacks.
 */
export const PrintBoxModal = memo(function PrintBoxModal({ box, onClose, onPrint }: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <Card className="w-full max-w-md p-6 bg-white shadow-2xl rounded-3xl border-slate-100 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-black text-[#181c3a]">Opciones de Impresión</h3>
          <button onClick={onClose} className="p-2 bg-slate-100 text-slate-400 rounded-full hover:bg-rose-100 hover:text-rose-500 transition-colors">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-6">Selecciona el formato de etiqueta que deseas imprimir para la caja <strong className="text-[#181c3a]">{box.id}</strong>:</p>

        <div className="grid grid-cols-2 gap-4">
          <Button
            variant="outline"
            className="flex flex-col items-center justify-center h-32 gap-3 bg-white border-2 border-slate-200 hover:border-[#2ec4f1] hover:bg-[#2ec4f1]/5 text-slate-600 hover:text-[#2ec4f1] transition-all rounded-2xl"
            onClick={() => onPrint('simple')}
          >
            <Printer size={32} strokeWidth={1.5} />
            <div className="text-center">
              <span className="block font-black text-[12px]">Etiqueta Simple</span>
              <span className="block font-normal text-[10px] opacity-70 mt-1">Identificador Exterior</span>
            </div>
          </Button>
          <Button
            variant="outline"
            className="flex flex-col items-center justify-center h-32 gap-3 bg-white border-2 border-slate-200 hover:border-[#181c3a] hover:bg-[#181c3a]/5 text-slate-600 hover:text-[#181c3a] transition-all rounded-2xl"
            onClick={() => onPrint('master')}
          >
            <QrCode size={32} strokeWidth={1.5} />
            <div className="text-center">
              <span className="block font-black text-[12px]">Caja Master</span>
              <span className="block font-normal text-[10px] opacity-70 mt-1">Detalle de Series (Guía)</span>
            </div>
          </Button>
        </div>
      </Card>
    </div>
  );
});
