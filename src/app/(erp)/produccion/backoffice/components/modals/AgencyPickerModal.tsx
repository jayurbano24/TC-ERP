'use client';

import React from 'react';
import { Card, Button } from '@/components/ui';
import { Plus } from 'lucide-react';
import type { CatalogAgency } from '../../types';

type Props = {
  open: boolean;
  agencies: CatalogAgency[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (agencyId: string) => void;
  onClose: () => void;
};

export function AgencyPickerModal({
  open,
  agencies,
  search,
  onSearchChange,
  onSelect,
  onClose,
}: Props) {
  if (!open) return null;

  const filtered = agencies.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xl p-6">
      <Card className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-none animate-rise-in p-0 max-h-[85vh] flex flex-col">
        <div className="bg-[var(--heading)] p-7 text-white flex justify-between items-center shrink-0">
          <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-1">
              Selección de Agencia
            </p>
            <h3 className="text-lg font-black uppercase tracking-tight">Agencia CAC</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
          >
            <Plus size={18} className="rotate-45" />
          </button>
        </div>
        <div className="p-6 border-b border-slate-100 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar agencia..."
            className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filtered.map((ag) => (
            <button
              key={ag.id}
              type="button"
              onClick={() => onSelect(ag.id)}
              className="w-full text-left p-4 rounded-2xl border-2 border-slate-100 hover:border-[var(--accent)] hover:bg-blue-50/30 transition-all"
            >
              <p className="text-xs font-black text-[var(--heading)]">{ag.id.toUpperCase().includes(ag.name.toUpperCase()) ? ag.id : `${ag.id} — ${ag.name}`}</p>
              <p className="text-[10px] text-slate-400 mt-1">{ag.direccion}</p>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-slate-100 shrink-0">
          <Button variant="outline" className="w-full" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </Card>
    </div>
  );
}
