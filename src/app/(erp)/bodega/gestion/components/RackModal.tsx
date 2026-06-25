'use client';

import { memo } from 'react';
import { Card, Button } from '@/components/ui';
import { MapPin, X } from 'lucide-react';

type Props = {
  box: any;
  rackNum: string;
  setRackNum: (v: string) => void;
  rackNivel: string;
  setRackNivel: (v: string) => void;
  rackPosicion: string;
  setRackPosicion: (v: string) => void;
  loading: boolean;
  onClose: () => void;
  onSave: () => void;
};

/**
 * C1: modal de ubicación (rack) extraído del monolito bodega/gestion y memoizado.
 * El estado vive en el padre; aquí solo se reciben valores + setters/callbacks.
 */
export const RackModal = memo(function RackModal({
  box,
  rackNum,
  setRackNum,
  rackNivel,
  setRackNivel,
  rackPosicion,
  setRackPosicion,
  loading,
  onClose,
  onSave,
}: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <Card className="w-full max-w-md p-6 bg-white shadow-2xl rounded-3xl border-slate-100 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-black text-[#181c3a] flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#2ec4f1]" />
            Actualizar Ubicación (Rack)
          </h3>
          <button onClick={onClose} className="p-2 bg-slate-100 text-slate-400 rounded-full hover:bg-rose-100 hover:text-rose-500 transition-colors">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          Ingrese las coordenadas exactas de la ubicación para la caja <strong className="text-[#181c3a]">{box.id}</strong>.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
                No. Rack
              </label>
              <input
                type="text"
                autoFocus
                className="w-full h-12 px-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[#2ec4f1] focus:bg-white transition-all uppercase"
                placeholder="Ej: A"
                value={rackNum}
                onChange={(e) => setRackNum(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
                Nivel
              </label>
              <input
                type="text"
                className="w-full h-12 px-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[#2ec4f1] focus:bg-white transition-all uppercase"
                placeholder="Ej: 2"
                value={rackNivel}
                onChange={(e) => setRackNivel(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
                Posición
              </label>
              <input
                type="text"
                className="w-full h-12 px-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[#2ec4f1] focus:bg-white transition-all uppercase"
                placeholder="Ej: A1"
                value={rackPosicion}
                onChange={(e) => setRackPosicion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSave();
                }}
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1 h-12 font-black uppercase tracking-widest text-[10px]"
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="flex-1 h-12 font-black uppercase tracking-widest text-[10px] bg-[#181c3a]"
              onClick={onSave}
              disabled={loading}
            >
              {loading ? 'Guardando...' : 'Guardar Ubicación'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
});
