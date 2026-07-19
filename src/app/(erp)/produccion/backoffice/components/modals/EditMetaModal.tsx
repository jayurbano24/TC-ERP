'use client';

import { Button, Card } from '@/components/ui';
import { Plus } from 'lucide-react';
import type { CatalogAgency, CatalogBrand, CatalogModel, CatalogTech } from '../../types';

export type EditMetaForm = { agency: string; tech: string; brand: string; model: string };

type Props = {
  reception: any;
  editMeta: EditMetaForm;
  saving: boolean;
  agencies: CatalogAgency[];
  technologies: CatalogTech[];
  brands: CatalogBrand[];
  models: CatalogModel[];
  onEditMetaChange: (patch: Partial<EditMetaForm>) => void;
  onSave: () => void;
  onClose: () => void;
};

export function EditMetaModal({ reception, editMeta, saving, agencies, technologies, brands, models, onEditMetaChange, onSave, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-xl p-6">
      <Card className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-none animate-rise-in p-0">
        <div className="bg-[var(--heading)] p-7 text-white flex justify-between items-center">
          <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-1">Completar datos faltantes</p>
            <h3 className="text-lg font-black uppercase tracking-tight">Guía {reception.guide_number}</h3>
          </div>
          <button onClick={() => onClose()} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all">
            <Plus size={18} className="rotate-45" />
          </button>
        </div>
        <div className="p-7 space-y-4">
          {/* Agencia */}
          <div>
            <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Agencia CAC</label>
            <select
              value={editMeta.agency}
              onChange={e => onEditMetaChange({ agency: e.target.value })}
              className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[var(--heading)] outline-none focus:border-[var(--accent)] transition-all"
            >
              <option value="">— Seleccionar Agencia —</option>
              {agencies.map(a => (
                <option key={a.id} value={a.name}>{a.id.toUpperCase().includes(a.name.toUpperCase()) ? a.id : `${a.id} — ${a.name}`}</option>
              ))}
            </select>
          </div>
          {/* Tecnología */}
          <div>
            <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Tecnología</label>
            <select
              value={editMeta.tech}
              onChange={e => onEditMetaChange({ tech: e.target.value, brand: '', model: '' })}
              className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[var(--heading)] outline-none focus:border-[var(--accent)] transition-all"
            >
              <option value="">— Seleccionar Tecnología —</option>
              {technologies.map(t => (
                <option key={t.id} value={t.nombre}>{t.nombre}</option>
              ))}
            </select>
          </div>
          {/* Marca */}
          <div>
            <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Marca</label>
            <select
              value={editMeta.brand}
              onChange={e => onEditMetaChange({ brand: e.target.value, model: '' })}
              className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[var(--heading)] outline-none focus:border-[var(--accent)] transition-all"
            >
              <option value="">— Seleccionar Marca —</option>
              {brands.map(b => (
                <option key={b.id} value={b.nombre}>{b.nombre}</option>
              ))}
            </select>
          </div>
          {/* Modelo */}
          <div>
            <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Modelo</label>
            <select
              value={editMeta.model}
              onChange={e => onEditMetaChange({ model: e.target.value })}
              className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[var(--heading)] outline-none focus:border-[var(--accent)] transition-all"
            >
              <option value="">— Seleccionar Modelo —</option>
              {models
                .filter(m => !editMeta.brand || brands.find(b => b.nombre === editMeta.brand)?.id === m.marcaId)
                .map(m => (
                  <option key={m.id} value={m.nombre}>{m.nombre}</option>
                ))}
            </select>
          </div>
        </div>
        <div className="px-7 pb-7 flex gap-3 justify-end">
          <Button variant="outline" onClick={() => onClose()} className="rounded-xl font-black uppercase text-[10px] tracking-widest px-6">Cancelar</Button>
          <Button
            onClick={onSave}
            disabled={saving}
            className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8 bg-[var(--heading)] text-white hover:bg-[var(--accent)] hover:text-[var(--heading)] transition-all"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
