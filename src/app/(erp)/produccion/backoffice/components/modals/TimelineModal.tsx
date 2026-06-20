'use client';

import { Badge, Card } from '@/components/ui';
import { Clock, History, X } from 'lucide-react';
import { getAgenciaLabel } from '../../backofficeHelpers';
import type { CatalogAgency } from '../../types';

type Props = {
  reception: any;
  activeGuide: string | null;
  agencies: CatalogAgency[];
  onActiveGuideChange: (g: string | null) => void;
  onClose: () => void;
};

export function TimelineModal({ reception, activeGuide, agencies, onActiveGuideChange, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border-none overflow-hidden animate-rise-in p-0">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
           <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-[#2ec4f1] rounded-2xl flex items-center justify-center text-[#181c3a] shadow-lg shadow-[#2ec4f1]/20">
               <History size={24} />
             </div>
             <div>
               <h3 className="text-xl font-black text-[#181c3a] uppercase tracking-tighter leading-none">Trazabilidad de la Guía</h3>
               <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest font-mono">{reception.guide_number}</p>
             </div>
           </div>
           <button onClick={() => onClose()} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all border border-slate-100"><X size={20} /></button>
        </div>
        <div className="p-10 max-h-[60vh] overflow-y-auto custom-scrollbar bg-white">
           {reception.processed_guides && reception.processed_guides.length > 1 && (
             <div className="flex flex-wrap gap-2 mb-8">
               <button 
                 onClick={() => onActiveGuideChange(null)}
                 className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!activeGuide ? 'bg-[#181c3a] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
               >
                 Toda la Recepción
               </button>
               {Array.from(new Set(reception.processed_guides)).map((g: any) => (
                 <button 
                   key={g}
                   onClick={() => onActiveGuideChange(g)}
                   className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeGuide === g ? 'bg-[#2ec4f1] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                 >
                   Guía {g}
                 </button>
               ))}
             </div>
           )}
           <div className="relative border-l-2 border-slate-100 ml-4 space-y-10">
              {(() => {
                const notes = reception.notes || '';
                let timelinePart = '';
                if (notes.includes('--- LÍNEA DE TIEMPO (MATRIZ) ---')) {
                  timelinePart = notes.split('--- LÍNEA DE TIEMPO (MATRIZ) ---').pop() || '';
                } else if (notes.includes('--- LÍNEA DE TIEMPO ---')) {
                  timelinePart = notes.split('--- LÍNEA DE TIEMPO ---').pop() || '';
                }
                const events = timelinePart.trim().split('\n').filter((l: string) => l.trim() !== '');
    
                let filteredEvents = events;
                if (activeGuide) {
                   filteredEvents = events.filter((event: string) => {
                      if (!event.includes('(Guía ')) return true;
                      return event.includes(activeGuide);
                   });
                }
    
                if (filteredEvents.length === 0) {
                  return (
                    <div className="text-center py-20 opacity-20">
                      <Clock size={48} className="mx-auto mb-4" />
                      <p className="text-xs font-black uppercase tracking-widest">Sin eventos registrados</p>
                    </div>
                  );
                }
    
                let lastKnownTime = '';
                return filteredEvents.map((event: string, idx: number) => {
                  let cleanTime = '';
                  let content = '';
    
                  if (event.includes('] ')) {
                    const [timeStr, ...rest] = event.split('] ');
                    cleanTime = (timeStr || '').replace('[', '');
                    lastKnownTime = cleanTime;
                    content = rest.join('] ');
                  } else {
                    // Skip corrupted lines that are not valid multi-line event continuations
                    if (event.includes('---') || event.toUpperCase().includes('BACKOFFICE_') || event.toUpperCase().includes('GUÍAS PROCESADAS')) {
                       return null;
                    }
                    content = event;
                    cleanTime = lastKnownTime;
                  }
                  
                  // PARSE MATRIZ: ID | CODE | ACTION: DETAIL
                  const pipeParts = content.split(' | ');
                  let meta = '';
                  let body = content;
                  if (pipeParts.length > 2) {
                    meta = pipeParts[0] + ' | ' + pipeParts[1];
                    body = pipeParts.slice(2).join(' | ');
                  } else if (pipeParts.length === 2) {
                    meta = pipeParts[0];
                    body = pipeParts[1];
                  }
                  
                  let action = '';
                  let detail = '';
                  
                  if (body) {
                     const parts = body.split(': ');
                     if (parts.length > 1) {
                        action = parts[0];
                        detail = parts.slice(1).join(': ');
                     } else {
                        action = 'METADATO / EVENTO';
                        detail = body;
                     }
                   } else if (content) {
                     const parts = content.split(': ');
                     if (parts.length > 1) {
                        action = parts[0];
                        detail = parts.slice(1).join(': ');
                     } else {
                        action = 'METADATO / EVENTO';
                        detail = content;
                     }
                  }
    
                  if (action.toUpperCase() === 'STATUS' && detail.toUpperCase() === 'RECIBIDO_BACKOFFICE') {
                     const agenciaNombre = getAgenciaLabel(reception, agencies);
                     if (agenciaNombre && agenciaNombre !== '---') {
                        detail = `${detail} - EN CAC / AGENCIA: ${agenciaNombre}`;
                     }
                  }
    
                  return (
                    <div key={idx} className="relative pl-10 group">
                      <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-[#2ec4f1] group-hover:scale-125 transition-transform shadow-sm" />
                      <div className="flex justify-between items-start mb-1">
                        {cleanTime && <p className="text-[9px] font-black text-[#2ec4f1] uppercase tracking-widest">{cleanTime}</p>}
                          <Badge className="bg-slate-100 text-slate-400 border-none text-[7px] font-black tracking-tighter px-1.5 h-4">
                            {meta.replace(' | ', ' • ')}
                          </Badge>
                      </div>
                      <h4 className="text-sm font-black text-[#181c3a] uppercase mb-1 tracking-tight">{action}</h4>
                      <p className="text-[11px] font-bold text-slate-500 leading-relaxed uppercase">{detail}</p>
                    </div>
                  );
                });
              })()}
           </div>
        </div>
        <div className="p-8 bg-slate-50 text-center border-t border-slate-100">
           <Badge className="bg-[#181c3a] text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border-none shadow-xl">
             Estatus Actual: {reception.status}
           </Badge>
        </div>
      </Card>
    </div>
  );
}
