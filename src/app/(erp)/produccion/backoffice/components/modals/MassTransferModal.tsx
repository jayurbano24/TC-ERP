'use client';

import { Button, Card } from '@/components/ui';
import { Plus } from 'lucide-react';
import type { CatalogBrand, CatalogModel, CatalogTech } from '../../types';

export type MassTransferForm = { techId: string; brandId: string; modelId: string; quantity: number | '' };

type Props = {
  open: boolean;
  data: MassTransferForm;
  technologies: CatalogTech[];
  brands: CatalogBrand[];
  models: CatalogModel[];
  onDataChange: (patch: Partial<MassTransferForm>) => void;
  onPrepare: () => void;
  onClose: () => void;
};

export function MassTransferModal({ open, data, technologies, brands, models, onDataChange, onPrepare, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-xl p-6">
      <Card className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-none animate-rise-in p-0">
        <div className="bg-amber-500 p-7 text-white flex justify-between items-center">
          <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-white/60 mb-1">Diagnóstico</p>
            <h3 className="text-lg font-black uppercase tracking-tight">Traslado Masivo a Taller</h3>
          </div>
          <button onClick={() => onClose()} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all">
            <Plus size={18} className="rotate-45" />
          </button>
        </div>
        <div className="p-7 space-y-5">
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Tecnología</label>
            <select
              className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[var(--heading)] outline-none focus:border-amber-500 transition-all"
              value={data.techId}
              onChange={(e) => onDataChange({ techId: e.target.value, brandId: '', modelId: '' })}
            >
              <option value="">-- SELECCIONAR --</option>
              {technologies.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Marca</label>
            <select
              className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[var(--heading)] outline-none focus:border-amber-500 transition-all disabled:opacity-50"
              value={data.brandId}
              disabled={!data.techId}
              onChange={(e) => onDataChange({ brandId: e.target.value, modelId: '' })}
            >
              <option value="">
                {data.techId ? '-- SELECCIONAR --' : '-- Tecnología primero --'}
              </option>
              {brands.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Modelo</label>
            <select
              className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[var(--heading)] outline-none focus:border-amber-500 transition-all disabled:opacity-50"
              value={data.modelId}
              disabled={!data.brandId}
              onChange={(e) => onDataChange({ modelId: e.target.value })}
            >
              <option value="">-- SELECCIONAR --</option>
              {models
                .filter(m => (!data.techId || m.tecnologiaId === data.techId) && (!data.brandId || m.marcaId === data.brandId))
                .map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Cantidad a Trasladar</label>
            <input
              type="number"
              className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[var(--heading)] outline-none focus:border-amber-500 transition-all"
              placeholder="Ej. 10"
              value={data.quantity}
              onChange={(e) => onDataChange({ quantity: e.target.value ? Number(e.target.value) : '' })}
            />
          </div>
        </div>
        <div className="p-7 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <Button variant="outline" className="h-12 px-6 rounded-2xl text-xs font-black uppercase text-slate-400 hover:text-[var(--heading)]" onClick={() => onClose()}>
            Cancelar
          </Button>
          <Button
            onClick={onPrepare}
            className="h-12 px-8 rounded-2xl text-xs font-black uppercase bg-amber-500 text-white hover:bg-amber-600 shadow-xl shadow-amber-500/20"
          >
            Escanear Equipos
          </Button>
        </div>
      </Card>
    </div>
  );
}
