'use client';

import { memo } from 'react';
import { Card, Badge } from '@/components/ui';
import { Box, XCircle } from 'lucide-react';

type Props = {
  item: any;
  activeTab: string;
  onClose: () => void;
};

/**
 * C1: modal de detalle de equipo extraído del monolito produccion/taller y memoizado.
 * Es read-only: solo recibe el item, el tab activo (color) y onClose.
 */
export const ItemDetailModal = memo(function ItemDetailModal({ item, activeTab, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border-none overflow-hidden animate-rise-in p-0">
        <div className={`p-8 border-b border-white/10 flex justify-between items-center text-white ${
          activeTab === 'diagnostico' ? 'bg-amber-500' :
          activeTab === 'reparacion' ? 'bg-blue-500' :
          activeTab === 'reacondicionado' ? 'bg-emerald-500' :
          activeTab === 'qc' ? 'bg-purple-500' :
          activeTab === 'l3' ? 'bg-orange-500' :
          activeTab === 'scraps' ? 'bg-rose-500' :
          activeTab === 'listo' ? 'bg-teal-500' :
          'bg-[#181c3a]'
        }`}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white bg-white/20 backdrop-blur-sm">
              <Box size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="blue" className="font-black text-[9px] uppercase border-none text-white bg-white/20 backdrop-blur-sm">
                  {item.id}
                </Badge>
              </div>
              <h3 className="text-2xl font-black text-white">Detalle de Equipo</h3>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <XCircle size={32} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">SN Principal</p>
              <p className="text-sm font-mono font-bold text-[#181c3a]">{item.sn}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Marca / Modelo</p>
              <p className="text-sm font-black text-[#181c3a] uppercase">{item.marca} {item.modelo}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tecnología</p>
              <p className="text-sm font-black text-[#181c3a] uppercase">{item.tecnologia}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total de Series</p>
              <p className="text-sm font-black text-[#181c3a]">{item.total_series}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Canal de Ingreso</p>
              <p className="text-sm font-black text-[#181c3a] uppercase">{item.courier}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Sucursal / Agencia</p>
              <p className="text-sm font-black text-[#181c3a] uppercase">{item.agencia}</p>
            </div>
            <div className="col-span-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Guía de Ingreso</p>
              <p className="text-sm font-black text-[#181c3a] uppercase">{item.guide}</p>
            </div>
          </div>

          {item.all_sns && item.all_sns.length > 0 && (
            <div>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Series del equipo (S1, S2…)</h4>
              <div className="flex flex-col gap-2">
                {item.all_sns.map((s: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                    <span className="text-[10px] font-black text-blue-800 bg-white px-2 py-0.5 rounded border border-blue-200 shrink-0">
                      S{i + 1}
                    </span>
                    <span className="text-xs font-mono font-bold text-[#181c3a] truncate">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
});
