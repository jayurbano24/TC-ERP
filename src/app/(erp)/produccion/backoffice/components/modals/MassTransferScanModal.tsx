'use client';

import React from 'react';
import { Button, Card } from '@/components/ui';
import { Barcode, Plus } from 'lucide-react';
import type { MassTransferForm } from './MassTransferModal';

type Props = {
  open: boolean;
  data: MassTransferForm;
  scannedSeries: string[];
  scanInput: string;
  loading: boolean;
  onScanInputChange: (v: string) => void;
  onScanKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onConfirm: () => void;
  onClose: () => void;
};

export function MassTransferScanModal({ open, data, scannedSeries, scanInput, loading, onScanInputChange, onScanKeyDown, onConfirm, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-xl p-6">
      <Card className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-none animate-rise-in p-0">
        <div className="bg-amber-500 p-7 text-white flex justify-between items-center">
          <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-white/60 mb-1">Traslado a Taller</p>
            <h3 className="text-lg font-black uppercase tracking-tight">Escanear Series</h3>
          </div>
          <button onClick={() => onClose()} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all">
            <Plus size={18} className="rotate-45" />
          </button>
        </div>
        
        <div className="p-7 space-y-6">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Progreso</p>
              <p className="text-2xl font-black text-[#181c3a]">{scannedSeries.length} <span className="text-sm text-slate-400">/ {data.quantity}</span></p>
            </div>
            <div className="w-full max-w-[200px] h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${(scannedSeries.length / Number(data.quantity)) * 100}%` }}
              />
            </div>
          </div>
    
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[#181c3a] block mb-2">Ingresar Serie (S/N)</label>
            <div className="relative">
              <input
                type="text"
                autoFocus
                disabled={scannedSeries.length >= Number(data.quantity)}
                placeholder={scannedSeries.length >= Number(data.quantity) ? "Completado" : "Pistolea el código de barras..."}
                value={scanInput}
                onChange={e => onScanInputChange(e.target.value)}
                onKeyDown={onScanKeyDown}
                className="w-full h-14 pl-12 pr-4 bg-slate-50 border-2 border-slate-200 focus:border-amber-500 outline-none rounded-2xl font-mono text-sm text-[#181c3a] transition-all"
              />
              <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            </div>
          </div>
    
          {scannedSeries.length > 0 && (
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 max-h-[150px] overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {scannedSeries.map((sn, i) => (
                  <span key={i} className="inline-block px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-mono font-bold text-[#181c3a]">
                    {sn}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
    
        <div className="p-7 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <Button variant="outline" className="h-12 px-6 rounded-2xl text-xs font-black uppercase text-slate-400 hover:text-[#181c3a]" onClick={() => onClose()}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={scannedSeries.length !== Number(data.quantity) || loading}
            className={`h-12 px-8 rounded-2xl text-xs font-black uppercase shadow-xl ${
              scannedSeries.length === Number(data.quantity) 
              ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/20' 
              : 'bg-slate-200 text-slate-400 shadow-none'
            }`}
          >
            {loading ? "Procesando..." : "Confirmar Traslado"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
