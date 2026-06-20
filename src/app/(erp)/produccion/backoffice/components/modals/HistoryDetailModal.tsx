'use client';

import { Badge, Button, Card } from '@/components/ui';
import { Database, Plus, Printer } from 'lucide-react';
import { getAgenciaLabel } from '../../backofficeHelpers';
import type { CatalogAgency, CatalogBrand, CatalogModel, CatalogTech } from '../../types';

type Props = {
  reception: any;
  series: any[];
  agencies: CatalogAgency[];
  technologies: CatalogTech[];
  brands: CatalogBrand[];
  models: CatalogModel[];
  onPrint: () => void;
  onClose: () => void;
};

export function HistoryDetailModal({ reception, series, agencies, technologies, brands, models, onPrint, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-xl p-6">
      <Card className="w-full max-w-5xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-none animate-rise-in p-0 flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="bg-[#181c3a] p-8 text-white flex justify-between items-start shrink-0">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40 mb-1">Detalle de Mercadería — Backoffice</p>
            <h3 className="text-2xl font-black uppercase tracking-tight">Guía {reception.guide_number}</h3>
          </div>
          <button onClick={() => onClose()} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all mt-1">
            <Plus size={20} className="rotate-45" />
          </button>
        </div>
    
        {/* Info cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-6 bg-slate-50 border-b border-slate-100 shrink-0">
          {/* Agencia */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Agencia CAC</p>
            <p className="text-sm font-black text-[#181c3a] uppercase leading-tight">
              {getAgenciaLabel(reception, agencies)}
            </p>
          </div>
          {/* Tecnología */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Tecnología</p>
            <p className="text-sm font-black text-[#181c3a] uppercase leading-tight">
              {(() => {
                const equipSeries = (series).filter((s: any) => s.brand_id);
                const firstEquip = equipSeries[0];
                const modelObj = firstEquip ? models.find(m => m.id === firstEquip.model_id) : null;
                const techFromSeries = modelObj ? (technologies.find(t => t.id === modelObj.tecnologiaId)?.nombre || '') : '';
                const notesTech = reception.notes?.includes('Backoffice_Tech: ') 
                  ? reception.notes.split('Backoffice_Tech: ')[1]?.split('\n')[0]?.trim() 
                  : '';
                return techFromSeries || notesTech || <span className="text-slate-300">—</span>;
              })()}
            </p>
          </div>
          {/* Marca */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Marca</p>
            <p className="text-sm font-black text-[#181c3a] uppercase leading-tight">
              {(() => {
                const equipSeries = (series).filter((s: any) => s.brand_id);
                const firstEquip = equipSeries[0];
                const brandFromSeries = firstEquip ? (brands.find(b => b.id === firstEquip.brand_id)?.nombre || '') : '';
                const notesBrand = reception.notes?.includes('Backoffice_Brand: ') 
                  ? reception.notes.split('Backoffice_Brand: ')[1]?.split('\n')[0]?.trim() 
                  : '';
                return brandFromSeries || notesBrand || <span className="text-slate-300">—</span>;
              })()}
            </p>
          </div>
          {/* Modelo */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Modelo</p>
            <p className="text-sm font-black text-[#181c3a] uppercase leading-tight">
              {(() => {
                const equipSeries = (series).filter((s: any) => s.brand_id);
                const firstEquip = equipSeries[0];
                const modelObj = firstEquip ? models.find(m => m.id === firstEquip.model_id) : null;
                const modelFromSeries = modelObj?.nombre || '';
                const notesModel = reception.notes?.includes('Backoffice_Model: ') 
                  ? reception.notes.split('Backoffice_Model: ')[1]?.split('\n')[0]?.trim() 
                  : '';
                return modelFromSeries || notesModel || <span className="text-slate-300">---</span>;
              })()}
            </p>
          </div>
          {/* Piloto */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Piloto</p>
            <p className="text-sm font-black text-[#181c3a] uppercase leading-tight">
              {reception.notes?.split('Piloto: ')[1]?.split('\n')[0]?.trim() || '---'}
            </p>
          </div>
        </div>
        {/* Second row: received by + status */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-6 pb-4 bg-slate-50 border-b border-slate-100 shrink-0">
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Courier</p>
            <p className="text-sm font-black text-[#181c3a] uppercase leading-tight">{reception.carrier || '---'}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Recibido en Backoffice</p>
            <p className="text-sm font-black text-[#181c3a] uppercase leading-tight">{reception.received_by || 'SISTEMA'}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Estatus</p>
            <span className={`text-[9px] uppercase font-black tracking-widest ${reception.status === 'EN_PROCESO_BACKOFFICE' ? 'text-[#181c3a]' : 'text-[#2ec4f1]'}`}>
              {reception.status}
            </span>
          </div>
        </div>
    
        {/* Series table */}
        <div className="p-6 overflow-y-auto flex-1">
          {(() => {
            const equipModalSeries = series.filter((s: any) => s.brand_id);
            const guideModalSeries = series.filter((s: any) => !s.brand_id);
            const hasEquip = equipModalSeries.length > 0;
            return (
              <>
                {/* Equipment series */}
                  <div className="mb-4">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">Series de Equipo ({equipModalSeries.length})</p>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#181c3a] text-white">
                            <th className="p-3 text-[8px] font-black uppercase tracking-widest">#</th>
                            <th className="p-3 text-[8px] font-black uppercase tracking-widest">No. de Serie</th>
                            <th className="p-3 text-[8px] font-black uppercase tracking-widest">Tecnología</th>
                            <th className="p-3 text-[8px] font-black uppercase tracking-widest">Marca</th>
                            <th className="p-3 text-[8px] font-black uppercase tracking-widest">Modelo</th>
                            <th className="p-3 text-[8px] font-black uppercase tracking-widest">No. Guía</th>
                            <th className="p-3 text-[8px] font-black uppercase tracking-widest text-right">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {equipModalSeries.map((s: any, idx: number) => {
                            const brand = brands.find(b => b.id === s.brand_id)?.nombre || s.brand_id || '---';
                            const modelObj = models.find(m => m.id === s.model_id);
                            const model = modelObj?.nombre || s.model_id || '---';
                            const tech = modelObj ? (technologies.find(t => t.id === modelObj.tecnologiaId)?.nombre || '---') : '---';
                            return (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="p-3 text-[9px] font-black text-slate-300">S-{idx + 1}</td>
                                <td className="p-3 font-mono font-black text-[#181c3a] text-xs">{s.serial_number}</td>
                                <td className="p-3 text-[10px] font-bold text-slate-500 uppercase">{tech}</td>
                                <td className="p-3 text-[10px] font-bold text-slate-500 uppercase">{brand}</td>
                                <td className="p-3 text-[10px] font-bold text-slate-500 uppercase">{model}</td>
                                <td className="p-3 font-mono text-[10px] font-black text-[#181c3a]">{reception.guide_number}</td>
                                <td className="p-3 text-right">
                                  <Badge className="bg-emerald-100 text-emerald-600 border-none text-[8px] uppercase font-black px-2 py-0.5">Recibido</Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                {/* Guide numbers */}
                {guideModalSeries.length > 0 && (
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">Guías / Cajas recibidas ({guideModalSeries.length})</p>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-100">
                            <th className="p-3 text-[8px] font-black uppercase tracking-widest text-slate-400">#</th>
                            <th className="p-3 text-[8px] font-black uppercase tracking-widest text-slate-400">No. de Guía / Caja</th>
                            <th className="p-3 text-[8px] font-black uppercase tracking-widest text-slate-400 text-right">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {guideModalSeries.map((s: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3 text-[9px] font-black text-slate-300">{idx + 1}</td>
                              <td className="p-3 font-mono font-black text-[#181c3a] text-xs">{s.serial_number}</td>
                              <td className="p-3 text-right">
                                <Badge className="bg-blue-100 text-blue-500 border-none text-[8px] uppercase font-black px-2 py-0.5">En Proceso</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {series.length === 0 && (
                  <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-white">
                    <Database className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No se han registrado series para este manifiesto aún</p>
                  </div>
                )}
              </>
            );
          })()}
        </div>
    
        <div className="p-6 bg-white border-t border-slate-100 flex justify-between items-center shrink-0">
          <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
            {series.filter((s: any) => s.brand_id).length} equipos - {series.filter((s: any) => !s.brand_id).length} guias
          </p>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8 border-2 border-slate-100 text-slate-500 hover:bg-slate-50" 
              onClick={() => onPrint()}
              leftIcon={<Printer className="w-4 h-4" />}
            >
              Imprimir PDF
            </Button>
            <Button variant="primary" className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8 bg-[#181c3a] text-white" onClick={() => onClose()}>Cerrar</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
