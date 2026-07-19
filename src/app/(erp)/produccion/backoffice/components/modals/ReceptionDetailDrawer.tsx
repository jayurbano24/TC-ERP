'use client';

import { Badge, Card } from '@/components/ui';
import { Clock, Package, X } from 'lucide-react';
import { getAgenciaLabel } from '../../backofficeHelpers';
import type { CatalogAgency } from '../../types';

type Props = {
  reception: any;
  series: any[];
  loading: boolean;
  agencies: CatalogAgency[];
  onClose: () => void;
};

export function ReceptionDetailDrawer({ reception, series, loading, agencies, onClose }: Props) {
  return (
      <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-sm">
        <div className="w-[95vw] max-w-none h-full bg-white shadow-2xl animate-slide-in-right flex flex-col">
          <div className="bg-[var(--heading)] p-8 text-white relative overflow-hidden shrink-0">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Package className="w-40 h-40" />
            </div>
            
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="blue" className="bg-[var(--accent)] text-[var(--heading)]">NO. GUÍA / CAJA: {reception.guide_number}</Badge>
                  </div>
                  <h3 className="text-3xl font-black uppercase">
                    {getAgenciaLabel(reception, agencies)}
                  </h3>
                  <div className="flex items-center gap-4 mt-2 text-white/60">
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest">
                      <Clock className="w-3 h-3 text-[var(--accent)]" /> {new Date(reception.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
                <button onClick={() => onClose()} className="p-2 hover:bg-white/10 rounded-xl transition-all"><X className="w-6 h-6" /></button>
              </div>
            </div>
          </div>
    
          <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                Contenido de la Recepción <span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> {loading ? 'Cargando...' : `${series.length} Unidades`}
              </h4>
              
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
                <table className="w-full text-left whitespace-nowrap">
                  <thead>
                    <tr className="bg-[var(--heading)] text-white">
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Fecha / Hora</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">No. Guía</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Tecnología</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Marca</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Modelo</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-1</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-2</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-3</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-4</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Material</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Lote</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={12} className="px-4 py-8 text-center text-slate-400 text-xs font-bold">
                          Cargando series...
                        </td>
                      </tr>
                    ) : series.length > 0 ? series.map((item: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{new Date(item.created_at || new Date()).toLocaleString()}</td>
                        <td className="px-4 py-3 text-[10px] font-bold text-[var(--heading)] font-mono">{reception.guide_number}</td>
                        <td className="px-4 py-3 text-[10px] font-black text-[var(--accent)] uppercase">{item.tecnologia || '---'}</td>
                        <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.marca || '---'}</td>
                        <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.modelo || '---'}</td>
                        <td className="px-4 py-3">
                          {item.s1 ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-bold text-[var(--heading)] rounded-md">{item.s1}</span> : <span className="text-slate-300">---</span>}
                        </td>
                        <td className="px-4 py-3">
                          {item.s2 ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-bold text-[var(--heading)] rounded-md">{item.s2}</span> : <span className="text-slate-300">---</span>}
                        </td>
                        <td className="px-4 py-3">
                          {item.s3 ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-bold text-[var(--heading)] rounded-md">{item.s3}</span> : <span className="text-slate-300">---</span>}
                        </td>
                        <td className="px-4 py-3">
                          {item.s4 ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-bold text-[var(--heading)] rounded-md">{item.s4}</span> : <span className="text-slate-300">---</span>}
                        </td>
                        <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.material || '---'}</td>
                        <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.lote || '---'}</td>
                        <td className="px-4 py-3">
                          <Badge className="bg-emerald-50 text-emerald-500 border-none font-black tracking-widest text-[9px] uppercase px-3 py-1">COMPLETADO</Badge>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={12} className="px-4 py-8 text-center text-slate-400 text-xs font-bold">
                          No hay series registradas en esta caja.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
