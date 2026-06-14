// @ts-nocheck
import React from 'react';
import { Search, Truck, Clock, Camera, Pencil, Printer, Trash2, Download, ClipboardList, Scan, ChevronLeft, ChevronRight, Eye, X, History } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export const HistoryTab = ({
  moduleMode,
  pxRecords,
  cacRecords,
  searchTerm,
  setSearchTerm,
  filterPilot,
  setFilterPilot,
  handleViewPxDetails,
  handlePrintPX,
  handlePrintCAC,
  handleDeleteHistoryCAC,
  handleEditHistoryCAC,
  showTimeline,
  setShowTimeline,
  timelineActiveGuide,
  setTimelineActiveGuide,
  setPxRecords
}: any) => {

  return (
    <div className="space-y-6 animate-rise-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-[#181c3a]">Historial de Recepciones ({moduleMode.toUpperCase()})</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Registros consolidados de auditoría</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex gap-2"><Download size={14} /> Exportar Reporte</Button>
        </div>
      </div>

      {/* PANEL DE MÉTRICAS HOY */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 border-l-4 border-l-[#2ec4f1] bg-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="bg-blue-50 p-3 rounded-xl text-[#2ec4f1]"><ClipboardList size={20} /></div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Guías Hoy</p>
              <h4 className="text-2xl font-black text-[#181c3a]">
                {cacRecords
                  .filter((r: any) => r.fecha_formateada?.includes(new Date().toLocaleDateString()))
                  .reduce((acc: any, r: any) => {
                    const cleanNotes = (r.notes || '').split('--- LÍNEA DE TIEMPO')[0].split('Backoffice_')[0].split('Guías Procesadas:')[0];
                    const notesGuias = cleanNotes?.split('Guías: ')[1]?.split('\\n')[0]?.split(',').map((g: string) => g.trim()).filter(Boolean) || [];
                    return acc + (notesGuias.length > 0 ? notesGuias.length : 1);
                  }, 0)}
              </h4>
            </div>
          </div>
        </Card>
        <Card className="p-6 border-l-4 border-l-emerald-500 bg-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="bg-emerald-50 p-3 rounded-xl text-emerald-500"><Scan size={20} /></div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Equipos Hoy</p>
              <h4 className="text-2xl font-black text-[#181c3a]">
                {cacRecords
                  .filter((r: any) => r.fecha_formateada?.includes(new Date().toLocaleDateString()))
                  .reduce((acc: any, r: any) => acc + (r.received_units || 0), 0)}
              </h4>
            </div>
          </div>
        </Card>
        <Card className="p-6 border-l-4 border-l-amber-500 bg-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="bg-amber-50 p-3 rounded-xl text-amber-500"><Clock size={20} /></div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">En Espera (Backoffice)</p>
              <h4 className="text-2xl font-black text-[#181c3a]">
                {cacRecords
                  .filter((r: any) => r.status === 'RECEPCIONADA' || r.status === 'PENDIENTE DE CLASIFICAR')
                  .reduce((acc: any, r: any) => {
                    const cleanNotes = (r.notes || '').split('--- LÍNEA DE TIEMPO')[0].split('Backoffice_')[0].split('Guías Procesadas:')[0];
                    const notesGuias = cleanNotes?.split('Guías: ')[1]?.split('\\n')[0]?.split(',').map((g: string) => g.trim()).filter(Boolean) || [];
                    return acc + (notesGuias.length > 0 ? notesGuias.length : 1);
                  }, 0)}
              </h4>
            </div>
          </div>
        </Card>
      </div>

      {/* BARRA DE BÚSQUEDA Y FILTROS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#2ec4f1] transition-colors" />
          <input 
            type="text" 
            placeholder={moduleMode === 'cac' ? "Buscar por No. Guía o Piloto..." : "Buscar por SAP, Agencia o Usuario..."}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-[#2ec4f1] transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="relative">
          <Truck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select 
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black uppercase outline-none focus:border-[#2ec4f1] appearance-none"
            value={filterPilot}
            onChange={(e) => setFilterPilot(e.target.value)}
          >
            <option value="Todos">{moduleMode === 'cac' ? 'Todos los Pilotos' : 'Todas las Agencias'}</option>
            {Array.from(new Set(
              moduleMode === 'cac' 
                ? cacRecords.map((r: any) => r.notes?.split('Piloto: ')[1]?.split('\\n')[0]).filter(Boolean)
                : pxRecords.map((r: any) => r.carrier).filter(Boolean)
            )).map((option: any) => (
              <option key={option as string} value={option as string}>{option as string}</option>
            ))}
          </select>
        </div>
      </div>

      {moduleMode === 'px' ? (
        <Card padding="none" className="overflow-x-auto custom-scrollbar border-none shadow-xl">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-[#181c3a] text-white/40 text-[10px] font-black uppercase tracking-widest">
              <tr>
                <th className="px-6 py-4">Fecha / Hora</th>
                <th className="px-6 py-4">Documento SAP</th>
                <th className="px-6 py-4">Nombre Agencia PX</th>
                <th className="px-6 py-4">Usuario</th>
                <th className="px-6 py-4 text-center">Cant. Cajas</th>
                <th className="px-6 py-4 text-center">Cantidad Equipos</th>
                <th className="px-6 py-4">Estatus</th>
                <th className="px-6 py-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pxRecords
                .filter((rec: any) => {
                  const searchLower = searchTerm.toLowerCase();
                  const matchSearch = !searchTerm || 
                    (rec.sap_document || '').toLowerCase().includes(searchLower) ||
                    (rec.carrier || '').toLowerCase().includes(searchLower) ||
                    (rec.received_by || 'SISTEMA').toLowerCase().includes(searchLower);
                  const matchFilter = filterPilot === 'Todos' || rec.carrier === filterPilot;
                  const notEliminated = rec.status !== 'ELIMINADO POR BODEGA';
                  return matchSearch && matchFilter && notEliminated;
                })
                .map((rec: any) => (
                <tr key={rec.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-5 font-bold text-slate-600 text-xs">{rec.fecha_formateada || new Date(rec.created_at).toLocaleString()}</td>
                  <td className="px-6 py-5 font-mono font-black text-[#181c3a]">{rec.sap_document || '---'}</td>
                  <td className="px-6 py-5 text-xs font-bold text-slate-500">{rec.carrier || '---'}</td>
                  <td className="px-6 py-5 text-xs font-bold text-slate-500">{rec.received_by || 'SISTEMA'}</td>
                  <td className="px-6 py-5 text-center font-black text-slate-800">{rec.notes?.match(/Cajas:\\s*(\\d+)/)?.[1] || 1} Cajas</td>
                  <td className="px-6 py-5 text-center font-black text-slate-800">{rec.received_units || 0} Equipos</td>
                  <td className="px-6 py-5">
                    <Badge className={`border-none font-black text-[9px] ${rec.status === 'ELIMINADO POR BODEGA' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {rec.status === 'ELIMINADO POR BODEGA' ? 'ELIMINADO POR BODEGA' : 'FINALIZADO'}
                    </Badge>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-4 transition-opacity">
                      <button className="text-slate-400 hover:text-indigo-500 transition-all hover:scale-110" title="Ver Detalle" onClick={(e) => {
                        e.stopPropagation();
                        handleViewPxDetails(rec);
                      }}>
                        <Eye size={22} strokeWidth={2} />
                      </button>
                      <button className="text-slate-400 hover:text-amber-500 transition-all hover:scale-110" title="Editar Documento SAP" onClick={async (e) => {
                        e.stopPropagation();
                        const newSap = prompt("Editar Documento SAP:", rec.sap_document || '');
                        if (newSap === null || newSap.trim() === '' || newSap.trim() === rec.sap_document) return;
                        try {
                          const supabase = getSupabaseBrowserClient();
                          if (!supabase) return;
                          const { error } = await supabase.from('receptions').update({ sap_document: newSap.trim() }).eq('id', rec.id);
                          if (error) throw error;
                          setPxRecords((prev: any) => prev.map((r: any) => r.id === rec.id ? { ...r, sap_document: newSap.trim() } : r));
                        } catch (err: any) {
                          alert("Error al actualizar: " + err.message);
                        }
                      }}>
                        <Pencil size={22} strokeWidth={2} />
                      </button>
                      <button className="text-slate-400 hover:text-[#2ec4f1] transition-all hover:scale-110" title="Imprimir" onClick={(e) => {
                        e.stopPropagation();
                        handlePrintPX(rec);
                      }}>
                        <Printer size={22} strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pxRecords.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-slate-300 italic text-[10px] font-bold uppercase tracking-widest">
                    No hay recepciones PX finalizadas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="bg-slate-50/50 p-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Mostrando 1-10 de {pxRecords.length} registros</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><ChevronLeft size={14} /></Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 bg-[#181c3a] text-white">1</Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">2</Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><ChevronRight size={14} /></Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden border-none shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#181c3a] text-white font-black uppercase tracking-[0.1em] text-[11px]">
                <tr>
                  <th className="px-6 py-5 whitespace-nowrap">Fecha / Hora</th>
                  <th className="px-6 py-5 whitespace-nowrap">No. Recepción TC</th>
                  <th className="px-6 py-5 whitespace-nowrap">Piloto</th>
                  <th className="px-6 py-5 whitespace-nowrap">Recibió</th>
                  <th className="px-6 py-5 whitespace-nowrap">Estatus</th>
                  <th className="px-6 py-5 whitespace-nowrap text-center">Unidades</th>
                  <th className="px-6 py-5 whitespace-nowrap text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cacRecords
                  .map((record: any) => {
                    const rawNotes = record.notes || '';
                    const cleanNotesForGuias = rawNotes
                      .split('--- LÍNEA DE TIEMPO')[0]
                      .split('Backoffice_')[0]
                      .split('Guías Procesadas:')[0];
                    const allGuias = cleanNotesForGuias?.split('Guías: ')[1]?.split('\\n')[0]?.split(',').map((g: string) => g.trim()).filter(Boolean) || [];
                    return { ...record, allGuias };
                  })
                  .filter((item: any) => {
                    const searchLower = searchTerm.toLowerCase();
                    const matchesSearch = !searchTerm ||
                      item.allGuias.some((g: string) => g.toLowerCase().includes(searchLower)) ||
                      item.guide_number?.toLowerCase().includes(searchLower) ||
                      (item.pilot_display && item.pilot_display.toLowerCase().includes(searchLower));
                    const matchesPilot = filterPilot === 'Todos' || item.pilot_display === filterPilot;
                    return matchesSearch && matchesPilot;
                  })
                  .map((item: any) => (
                    <tr key={item.id} className="hover:bg-blue-50/50 transition-colors border-b border-slate-100 group">
                      <td className="px-6 py-4 font-bold text-slate-800 text-xs whitespace-nowrap">{item.fecha_formateada}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-black text-[#2ec4f1] text-sm tracking-wide">{item.guide_number}</span>
                        </div>
                        {item.allGuias.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.allGuias.map((g: string, i: number) => (
                              <button 
                                key={i} 
                                onClick={() => { setShowTimeline(item); setTimelineActiveGuide(g); }}
                                className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 hover:text-[#181c3a] px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                                title={`Ver trazabilidad de la guía ${g}`}
                              >
                                {g}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-black text-slate-800 text-xs uppercase">{item.pilot_display}</td>
                      <td className="px-6 py-4 font-black text-slate-700 text-xs">{item.usuario}</td>
                      <td className="px-6 py-4">
                        <Badge className="border-none font-black text-[9px] uppercase tracking-widest whitespace-nowrap bg-blue-50 text-blue-600">
                          {item.status || 'RECEPCIONADA'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-black text-[#181c3a]">{item.received_units || 0}</span>
                        <span className="text-slate-400 text-[10px] font-bold ml-1">u.</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setShowTimeline(item)} className="w-8 h-8 flex items-center justify-center bg-blue-50 text-[#2ec4f1] rounded-lg hover:bg-[#2ec4f1] hover:text-white transition-all shadow-sm"><Clock className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleEditHistoryCAC(item.id, item.guiaIdx)} className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg hover:bg-[#181c3a] hover:text-white transition-all shadow-sm"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handlePrintCAC(item)} className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg hover:bg-[#181c3a] hover:text-white transition-all shadow-sm"><Printer className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteHistoryCAC(item.id, item.guiaIdx)} className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg hover:bg-rose-500 hover:text-white transition-all shadow-sm"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {cacRecords.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-300 italic uppercase font-black tracking-widest">
                      No hay registros de CAC disponibles
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal Trazabilidad iría aquí o extraído en un sub-componente */}
    </div>
  );
};
