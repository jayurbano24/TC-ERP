'use client';

import React from 'react';
import { Card, Button } from '@/components/ui';
import { Plus } from 'lucide-react';

type Props = {
  open: boolean;
  bulkText: string;
  onBulkTextChange: (value: string) => void;
  onImport: () => void;
  onClose: () => void;
};

export function BulkSeriesModal({
  open,
  bulkText,
  onBulkTextChange,
  onImport,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xl p-6">
      <Card className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-none animate-rise-in p-0">
        <div className="bg-[var(--heading)] p-7 text-white flex justify-between items-center">
          <h3 className="text-lg font-black uppercase tracking-tight">Carga Masiva de Series</h3>
          <button type="button" onClick={onClose} className="text-slate-300 hover:text-[var(--heading)]">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>
        <div className="p-7 space-y-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Pegue una serie por línea
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => onBulkTextChange(e.target.value)}
            rows={10}
            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-xs outline-none focus:border-[var(--accent)] resize-none"
            placeholder="SN001&#10;SN002&#10;SN003"
          />
          <div className="flex gap-4">
            <Button
              variant="outline"
              className="flex-1 h-14 rounded-2xl font-black uppercase text-[10px]"
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="flex-[2] h-14 rounded-2xl font-black uppercase text-[10px] bg-[var(--heading)] text-white shadow-xl shadow-blue-500/10"
              onClick={onImport}
            >
              Procesar e Importar
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
