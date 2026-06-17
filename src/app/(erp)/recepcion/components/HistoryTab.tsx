// @ts-nocheck
import React from 'react';
import { Search, Truck, Clock, Camera, Pencil, Printer, Trash2, Download, ClipboardList, Scan, ChevronLeft, ChevronRight, Eye, X, History, Tag, Box } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { printingService } from '../services/printingService';

export const HistoryTab = ({
  moduleMode,
  pxRecords,
  cacRecords,
  searchTerm,
  setSearchTerm,
  filterPilot,
  setFilterPilot,
  showTimeline,
  setShowTimeline,
  timelineActiveGuide,
  setTimelineActiveGuide,
  setPxRecords,
  handlePrintCAC,
  handlePrintPX,
  handlePrintLabelsPX,
  handleDeleteHistoryCAC
}: any) => {

  const [showPxDetails, setShowPxDetails] = React.useState<any>(null);
  const [pxDetailsData, setPxDetailsData] = React.useState<any>({ boxes: [], series: [], loading: false });
  const [filterDate, setFilterDate] = React.useState<string>('Todos');

  const isDateMatch = (createdAt: string) => {
    if (filterDate === 'Todos') return true;
    if (!createdAt) return true;
    const d = new Date(createdAt);
    const now = new Date();
    if (filterDate === 'Hoy') {
      return d.toLocaleDateString() === now.toLocaleDateString();
    }
    if (filterDate === 'Mes') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (filterDate === 'Semana') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      return d >= weekAgo;
    }
    if (filterDate === 'Año') {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  };

  const handleViewPxDetails = async (rec: any) => {
    setShowPxDetails(rec);
    setPxDetailsData({ boxes: [], series: [], loading: true });
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data: boxes } = await supabase.from('boxes').select('*, brands(name), models(name, technologies(name))').eq('reception_id', rec.id);
      const { data: series } = await supabase.from('series').select('*').eq('current_reception_id', rec.id);
      setPxDetailsData({ boxes: boxes || [], series: series || [], loading: false });
    } catch (error) {
      console.error(error);
      setPxDetailsData({ boxes: [], series: [], loading: false });
    }
  };

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
           {/* BARRA DE BÚSQUEDA Y FILTROS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
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
                ? cacRecords.map((r: any) => r.notes?.split('Piloto: ')[1]?.split('\n')[0]).filter(Boolean)
                : pxRecords.map((r: any) => r.carrier).filter(Boolean)
            )).map((option: any) => (
              <option key={option as string} value={option as string}>{option as string}</option>
            ))}
          </select>
        </div>

        <div className="relative">
          <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select 
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black uppercase outline-none focus:border-[#2ec4f1] appearance-none"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          >
            <option value="Todos">Todas las Fechas</option>
            <option value="Hoy">Hoy</option>
            <option value="Semana">La semana pasada</option>
            <option value="Mes">Este Mes</option>
            <option value="Año">El año completo</option>
          </select>
        </div>
      </div>     </div>

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
                  const matchDate = isDateMatch(rec.created_at);
                  const notEliminated = rec.status !== 'ELIMINADO POR BODEGA' && rec.status !== 'ARCHIVADO';
                  return matchSearch && matchFilter && matchDate && notEliminated;
                })
                .map((rec: any) => (
                <tr key={rec.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-5 font-bold text-slate-600 text-xs">{rec.fecha_formateada || new Date(rec.created_at).toLocaleString()}</td>
                  <td className="px-6 py-5 font-mono font-black text-[#181c3a]">{rec.sap_document || '---'}</td>
                  <td className="px-6 py-5 text-xs font-bold text-slate-500">{rec.carrier || '---'}</td>
                  <td className="px-6 py-5 text-xs font-bold text-slate-500">{(rec.notes?.split('Recibido Por: ')?.[1]?.split('\n')?.[0]?.trim() || rec.received_by || 'SISTEMA').split('@')[0]}</td>
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
                      <button className="text-slate-400 hover:text-purple-500 transition-all hover:scale-110" title="Imprimir Etiquetas" onClick={(e) => {
                        e.stopPropagation();
                        handlePrintLabelsPX && handlePrintLabelsPX(rec);
                      }}>
                        <Tag size={22} strokeWidth={2} />
                      </button>
                      <button className="text-slate-400 hover:text-[#2ec4f1] transition-all hover:scale-110" title="Imprimir Conduce" onClick={(e) => {
                        e.stopPropagation();
                        handlePrintPX(rec);
                      }}>
                        <Printer size={22} strokeWidth={2} />
                      </button>
                      <button className="text-slate-400 hover:text-rose-500 transition-all hover:scale-110" title="Eliminar Recepción" onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`¿Está seguro que desea eliminar la recepción ${rec.sap_document || rec.guide_number}?`)) {
                          try {
                            const supabase = getSupabaseBrowserClient();
                            if (!supabase) return;
                            const { error } = await supabase.from('receptions').update({ status: 'ELIMINADO POR BODEGA' }).eq('id', rec.id);
                            if (error) throw error;
                            setPxRecords((prev: any) => prev.map((r: any) => r.id === rec.id ? { ...r, status: 'ELIMINADO POR BODEGA' } : r));
                          } catch (err: any) {
                            alert("Error al eliminar: " + err.message);
                          }
                        }
                      }}>
                        <Trash2 size={22} strokeWidth={2} />
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
                    let allGuias = cleanNotesForGuias?.split('Guías: ')[1]?.split('\\n')[0]?.split(',').map((g: string) => g.trim()).filter(Boolean) || [];
                    if (record.allGuias && record.allGuias.length > 0) {
                      allGuias = record.allGuias;
                    }
                    if (allGuias.length === 0 && record.guide_number) {
                      allGuias = [record.guide_number];
                    }
                    return { ...record, allGuias };
                  })
                  .filter((item: any) => {
                    const searchLower = searchTerm.toLowerCase();
                    const matchesSearch = !searchTerm ||
                      item.allGuias.some((g: string) => g.toLowerCase().includes(searchLower)) ||
                      item.guide_number?.toLowerCase().includes(searchLower) ||
                      (item.pilot_display && item.pilot_display.toLowerCase().includes(searchLower));
                    const matchesPilot = filterPilot === 'Todos' || item.pilot_display === filterPilot;
                    const matchDate = isDateMatch(item.created_at);
                    const notEliminated = item.status !== 'ELIMINADO' && item.status !== 'ELIMINADO POR BODEGA' && item.status !== 'ARCHIVADO';
                    return matchesSearch && matchesPilot && matchDate && notEliminated;
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
                      <td className="px-6 py-4 font-black text-slate-700 text-xs">{(item.notes?.split('Recibido Por: ')?.[1]?.split('\n')?.[0]?.trim() || item.usuario || item.received_by || 'SISTEMA').split('@')[0]}</td>
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

      {/* MODAL DETALLE PX */}
      {showPxDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-rise-in">
            <div className="bg-[#181c3a] p-5 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                  <Box className="w-5 h-5 text-[#2ec4f1]" />
                </div>
                <div>
                  <h3 className="font-black tracking-widest uppercase text-sm">Detalle de Recepción PX</h3>
                  <p className="text-[10px] text-white/50 mt-1 uppercase tracking-wider">
                    {showPxDetails.fecha_formateada || new Date(showPxDetails.created_at).toLocaleString()} • Por: {(showPxDetails.notes?.split('Recibido Por: ')?.[1]?.split('\n')?.[0]?.trim() || showPxDetails.received_by || 'SISTEMA').split('@')[0]}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowPxDetails(null)}
                className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-rose-500 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Doc SAP</p>
                  <p className="font-black text-[#181c3a]">{showPxDetails.sap_document || 'N/A'}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Proveedor</p>
                  <p className="font-black text-[#181c3a]">{showPxDetails.carrier || 'N/A'}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cajas</p>
                  <p className="font-black text-[#2ec4f1] text-lg">{pxDetailsData.boxes.length}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Equipos</p>
                  <p className="font-black text-emerald-500 text-lg">{pxDetailsData.series.length}</p>
                </div>
              </div>

              {pxDetailsData.loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <div className="w-8 h-8 border-4 border-[#2ec4f1] border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-xs font-bold uppercase tracking-widest">Cargando detalles...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {pxDetailsData.boxes.map((box: any) => {
                    const boxSeries = pxDetailsData.series.filter((s: any) => s.current_reception_id === showPxDetails.id);
                    return (
                      <Card key={box.id} className="p-0 overflow-hidden border border-slate-200 shadow-sm">
                        <div className="bg-white p-4 border-b border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <Badge variant="slate" className="font-black text-sm px-4 py-1.5">{box.box_code}</Badge>
                            <div className="flex flex-col">
                              <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest leading-tight">Marca & Modelo</span>
                              <span className="text-sm font-black text-[#181c3a]">{box.brands?.name || 'N/A'} <span className="text-slate-300 mx-1">|</span> {box.models?.name || 'N/A'}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Capacidad</p>
                              <p className="text-sm font-black text-[#2ec4f1]">{box.capacity} und</p>
                            </div>
                            <button
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                const mappedBox = {
                                  ...box,
                                  boxCode: box.box_code,
                                  marca: box.brands?.name || 'N/A',
                                  modelo: box.models?.name || 'N/A',
                                  tecnologia: box.models?.technologies?.name || 'EQUIPO',
                                  totalEsperado: box.capacity || 0
                                };
                                printingService.printAllBoxLabels([mappedBox]); 
                              }}
                              className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-[#181c3a] text-slate-400 hover:text-white rounded-xl transition-all shadow-sm"
                              title="Imprimir Etiqueta Individual"
                            >
                              <Printer size={18} strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3">
              <Button onClick={() => handlePrintLabelsPX(showPxDetails)} className="bg-[#2ec4f1] hover:bg-[#25a8d1] text-white text-[10px] uppercase font-black tracking-widest rounded-lg h-10 px-6">
                <Tag className="w-4 h-4 mr-2" /> Imprimir Etiquetas
              </Button>
              <Button onClick={() => setShowPxDetails(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] uppercase font-black tracking-widest rounded-lg h-10 px-6">
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {showTimeline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-rise-in">
            <div className="bg-[#181c3a] p-5 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                  <History className="w-5 h-5 text-[#2ec4f1]" />
                </div>
                <div>
                  <h3 className="font-black tracking-widest uppercase text-sm">
                    {timelineActiveGuide ? `Trazabilidad - Guía ${timelineActiveGuide}` : 'Trazabilidad de Recepción'}
                  </h3>
                  <p className="text-[10px] text-white/50 mt-1 uppercase tracking-wider">
                    Registro de movimientos TC: {showTimeline.guide_number}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setShowTimeline(null); setTimelineActiveGuide(null); }}
                className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-rose-500 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 bg-slate-50">
              <div className="relative pl-6 space-y-6">
                <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-200" />
                
                <div className="relative flex items-start gap-4">
                  <div className="absolute -left-[30px] w-6 h-6 rounded-full border-4 border-slate-50 bg-[#2ec4f1] z-10" />
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex-1">
                    <p className="text-xs font-black uppercase tracking-widest text-[#181c3a]">Recepción Registrada</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">
                      {showTimeline.fecha_formateada || (showTimeline.created_at ? new Date(showTimeline.created_at).toLocaleString() : 'Fecha no disponible')}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Recibido por: {(showTimeline.notes?.split('Recibido Por: ')?.[1]?.split('\n')?.[0]?.trim() || showTimeline.usuario || showTimeline.received_by || 'SISTEMA').split('@')[0]}
                    </p>
                  </div>
                </div>

                {showTimeline.allGuias && showTimeline.allGuias.length > 0 && (
                  <div className="relative flex items-start gap-4">
                    <div className="absolute -left-[30px] w-6 h-6 rounded-full border-4 border-slate-50 bg-slate-300 z-10" />
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex-1">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Filtrar por Guía Específica</p>
                      <div className="flex flex-wrap gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setTimelineActiveGuide(null); }}
                          className={`border rounded-md px-3 py-1.5 flex items-center justify-center transition-all ${!timelineActiveGuide ? 'bg-slate-800 border-slate-800 text-white shadow-md scale-105' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-800'}`}
                          title="Ver todas las guías"
                        >
                          <span className="font-mono text-xs font-bold">TODAS</span>
                        </button>
                        {showTimeline.allGuias.map((g: string, i: number) => (
                          <button 
                            key={i} 
                            onClick={(e) => { e.stopPropagation(); setTimelineActiveGuide(g); }}
                            className={`border rounded-md px-3 py-1.5 flex items-center justify-center transition-all ${timelineActiveGuide === g ? 'bg-[#2ec4f1] border-[#2ec4f1] text-white shadow-md scale-105' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-[#2ec4f1]'}`}
                            title={`Ver detalle de movimientos para la guía ${g}`}
                          >
                            <span className="font-mono text-xs font-bold">{g}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Eventos Dinámicos de la Línea de Tiempo */}
                {(() => {
                  const notes = showTimeline.notes || '';
                  const lines = notes.split('\n');
                  const events = [];
                  let inTimeline = false;
                  for (const line of lines) {
                    if (line.includes('--- LÍNEA DE TIEMPO')) { inTimeline = true; continue; }
                    if (inTimeline && line.startsWith('---')) { inTimeline = false; }
                    if (inTimeline) {
                      const match = line.match(/^\[(.*?)\] (.*)$/);
                      if (match) {
                        const dateStr = match[1];
                        const content = match[2];
                        if (timelineActiveGuide) {
                          const guideMatch = content.match(/\(Guía (.*?)\)/);
                          if (guideMatch && guideMatch[1] !== timelineActiveGuide) continue;
                        }
                        // Skip initial reception event as it's hardcoded above
                        if (!content.includes('RECEPCIÓN: Ingreso inicial')) {
                           events.push({ date: dateStr, content: content });
                        }
                      }
                    }
                  }
                  
                  // Deduplicate identical events (sometimes appended twice in notes)
                  const uniqueEvents = Array.from(new Map(events.map(e => [e.date + e.content, e])).values());

                  return uniqueEvents.map((evt: any, i: number) => {
                    const isClasificacion = evt.content.includes('CLASIFICACIÓN');
                    const color = isClasificacion ? 'bg-purple-500' : 'bg-emerald-500';
                    return (
                      <div key={i} className="relative flex items-start gap-4">
                        <div className={`absolute -left-[30px] w-6 h-6 rounded-full border-4 border-slate-50 ${color} z-10`} />
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex-1">
                          <p className="text-[10px] font-bold text-slate-400 mb-1">{evt.date}</p>
                          <p className="text-xs font-bold text-[#181c3a]">{evt.content}</p>
                        </div>
                      </div>
                    );
                  });
                })()}

                <div className="relative flex items-start gap-4">
                  <div className={`absolute -left-[30px] w-6 h-6 rounded-full border-4 border-slate-50 ${showTimeline.status !== 'RECEPCIONADA' ? 'bg-[#2ec4f1]' : 'bg-slate-200'} z-10`} />
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex-1">
                    <p className={`text-xs font-black uppercase tracking-widest ${showTimeline.status !== 'RECEPCIONADA' ? 'text-[#181c3a]' : 'text-slate-400'}`}>Estado Final Actual</p>
                    <Badge className={`mt-2 ${showTimeline.status !== 'RECEPCIONADA' ? 'bg-[#2ec4f1] hover:bg-[#2ec4f1]' : 'bg-slate-200 text-slate-500 hover:bg-slate-200'}`}>
                      {showTimeline.status || 'RECEPCIONADA'}
                    </Badge>
                  </div>
                </div>

              </div>
            </div>
            
            <div className="p-4 bg-white border-t border-slate-100 flex justify-end">
              <Button onClick={() => { setShowTimeline(null); setTimelineActiveGuide(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] uppercase font-black tracking-widest rounded-lg h-10 px-6">
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
