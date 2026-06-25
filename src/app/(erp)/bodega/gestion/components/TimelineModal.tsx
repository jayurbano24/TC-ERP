'use client';

import { memo } from 'react';
import { Card, Badge } from '@/components/ui';
import { History, X, Loader2, Clock, Info, Box } from 'lucide-react';

type Props = {
  box: any;
  loadingBoxHistory: boolean;
  boxHistoryData: any[];
  timelineGuideDetails: any;
  catMarcas: any[];
  catModelos: any[];
  onClose: () => void;
};

/**
 * C1: modal de trazabilidad (timeline) extraído del monolito bodega/gestion y memoizado.
 * El estado/fetch vive en el padre; aquí solo se reciben datos + onClose.
 */
export const TimelineModal = memo(function TimelineModal({
  box,
  loadingBoxHistory,
  boxHistoryData,
  timelineGuideDetails,
  catMarcas,
  catModelos,
  onClose,
}: Props) {
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
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest font-mono">
                {box.box_code ? `${box.box_code} · ` : ''}{box.guide_number}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all border border-slate-100"><X size={20} /></button>
        </div>
        <div className="p-10 max-h-[60vh] overflow-y-auto custom-scrollbar bg-white">
          <div className="relative border-l-2 border-slate-100 ml-4 space-y-10">
            {(() => {
              if (loadingBoxHistory) {
                return (
                  <div className="text-center py-20 opacity-50">
                    <Loader2 size={48} className="mx-auto mb-4 animate-spin" />
                    <p className="text-xs font-black uppercase tracking-widest">Cargando Historial Transaccional...</p>
                  </div>
                );
              }

              if (boxHistoryData.length === 0) {
                return (
                  <div className="text-center py-20 opacity-20">
                    <Clock size={48} className="mx-auto mb-4" />
                    <p className="text-xs font-black uppercase tracking-widest">Sin eventos registrados</p>
                  </div>
                );
              }

              return (
                <>
                  {boxHistoryData.map((event: any, idx: number) => {
                    const cleanTime = new Date(
                      event.timestamp || event.ts || event.created_at
                    ).toLocaleString();
                    let content = event.reason || `Movimiento: ${event.movement_type || 'EVENTO'}`;
                    if (!event.reason && event.movement_type) {
                      content = `Movimiento: ${event.movement_type}`;
                      if (event.source_location) content += ` | Origen: ${event.source_location}`;
                      if (event.target_location) content += ` | Destino: ${event.target_location}`;
                      if (event.series_count != null) content += ` | Series: ${event.series_count}`;
                    }

                    const operator = event.user_name || event.operator_name || 'Sistema';

                    const isLast = idx === boxHistoryData.length - 1;
                    return (
                      <div key={idx} className="relative group">
                        <div className="absolute -left-[23px] top-1/2 -mt-1.5 w-3 h-3 rounded-full bg-slate-200 group-hover:bg-[#2ec4f1] ring-4 ring-white shadow-sm transition-colors z-10" />
                        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md hover:border-[#2ec4f1]/30 transition-all">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Clock size={12} className="text-slate-400" />
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{cleanTime}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400">
                              <Info size={12} />
                              <span className="text-[9px] font-black uppercase tracking-widest">{operator}</span>
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-[#181c3a]">{content}</p>
                        </div>
                        {!isLast && <div className="absolute left-[-17px] top-[calc(50%+6px)] bottom-[-calc(50%+6px)] w-[2px] bg-slate-100" />}
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>

          {timelineGuideDetails?.loading ? (
            <div className="mt-8 text-center text-slate-400">
              <div className="w-6 h-6 border-2 border-[#2ec4f1] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-[10px] uppercase font-black tracking-widest">Cargando detalles de la guía...</p>
            </div>
          ) : timelineGuideDetails?.data ? (
            <div className="mt-10 pt-8 border-t-2 border-dashed border-slate-200">
              <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                <Box size={14} className="text-[#2ec4f1]" />
                Equipos Registrados en esta Guía
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {timelineGuideDetails.data.service_orders?.map((so: any, i: number) => {
                  const marcaStr = catMarcas.find((m: any) => m.id === so.brand_id)?.name || '---';
                  const modeloStr = catModelos.find((m: any) => m.id === so.model_id)?.name || '---';
                  return (
                    <div key={so.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 group hover:border-[#2ec4f1]/30 transition-colors">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-[9px] font-black uppercase text-[#2ec4f1] tracking-widest block mb-0.5">{so.os_label}</span>
                          <span className="text-xs font-black text-[#181c3a]">{marcaStr} {modeloStr}</span>
                        </div>
                        <Badge variant="outline" className="bg-white border-slate-200 text-slate-400 text-[9px] font-black tracking-widest">
                          {so.series?.length || 0} SERIE{(so.series?.length || 0) !== 1 ? 'S' : ''}
                        </Badge>
                      </div>
                      <details className="group/details mt-3">
                        <summary className="text-[9px] font-black uppercase text-slate-400 cursor-pointer hover:text-[#2ec4f1] list-none outline-none select-none flex items-center justify-between p-2 bg-white border border-slate-100 rounded-lg transition-colors">
                          <span>Ver detalle de series en log</span>
                          <span className="group-open/details:rotate-180 transition-transform duration-300 text-[8px]">▼</span>
                        </summary>
                        <div className="space-y-1 mt-2 bg-white rounded-xl p-2 border border-slate-100 shadow-sm">
                          {so.series?.map((s: any, idx: number) => (
                            <div key={idx} className="flex gap-2 items-center text-[10px] font-mono font-bold text-slate-500 bg-slate-50 p-1.5 rounded-lg">
                              <span className="text-slate-400 w-6">S-{idx + 1}</span>
                              <span className="text-[#181c3a]">{s.serial_number}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : timelineGuideDetails?.error ? (
            <div className="mt-8 text-center text-rose-400 bg-rose-50 p-4 rounded-xl">
              <p className="text-[10px] uppercase font-black tracking-widest">{timelineGuideDetails.error}</p>
            </div>
          ) : null}

        </div>
        <div className="p-8 bg-slate-50 text-center border-t border-slate-100">
          <Badge className="bg-[#181c3a] text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border-none shadow-xl">
            Estatus Actual: {box.status}
          </Badge>
        </div>
      </Card>
    </div>
  );
});
