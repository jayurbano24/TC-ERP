'use client';

import { memo, type FormEvent } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import {
  Warehouse, Cpu, MapPin, QrCode, Info, Calendar, PackageCheck,
  ArrowRight, History, Eye, Pencil, Printer, Trash2,
} from 'lucide-react';

type Props = {
  selectedBox: any;
  catMarcas: any[];
  catModelos: any[];
  catTecnologias: any[];
  currentSN: string;
  setCurrentSN: (v: string) => void;
  lastScannedInfo: any;
  onAddSN: (e: FormEvent) => void;
  onShowTimeline: (item: any) => void;
  onRemoveUnit: (item: any) => void;
  onClose: () => void;
};

/**
 * C1: modal de detalle/cierre de caja ("Ingreso Inteligente") extraído del
 * monolito bodega/gestion y memoizado. El estado/DB vive en el padre.
 */
export const DetalleCajaModal = memo(function DetalleCajaModal({
  selectedBox,
  catMarcas,
  catModelos,
  catTecnologias,
  currentSN,
  setCurrentSN,
  lastScannedInfo,
  onAddSN,
  onShowTimeline,
  onRemoveUnit,
  onClose,
}: Props) {
  const uniqueEquipmentsCount = new Set(selectedBox.series?.map((s: any) => s.service_orders?.id || s.serial_number)).size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-[#181c3a]/40 backdrop-blur-sm">
      <div className="w-[95vw] max-w-none h-full bg-white shadow-2xl animate-slide-in-right flex flex-col">
        <div className="bg-[#181c3a] p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Warehouse className="w-40 h-40" />
          </div>

          <div className="relative z-10">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="blue" className="bg-[#2ec4f1] text-[#181c3a]">ID: {selectedBox.id}</Badge>
                  <Badge variant="slate" className="bg-white/10 text-white/60">INGRESO INTELIGENTE</Badge>
                </div>
                <h3 className="text-3xl font-black">
                  {catMarcas.find(b => b.id === selectedBox.marca)?.name || selectedBox.marca} - {catModelos.find(m => m.id === selectedBox.modelo)?.name || selectedBox.modelo}
                </h3>
                <div className="flex items-center gap-4 mt-2 text-white/60">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest">
                    <Cpu className="w-3 h-3 text-[#2ec4f1]" /> {catTecnologias.find(t => t.id === selectedBox.series[0]?.tecnologia)?.name || selectedBox.series[0]?.tecnologia || 'N/A'}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest">
                    <MapPin className="w-3 h-3 text-[#2ec4f1]" /> {selectedBox.rack}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-all">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                <div className="flex justify-between items-end mb-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/40 leading-none">Progreso Caja</span>
                  <span className="text-2xl font-black text-[#2ec4f1] leading-none">
                    {uniqueEquipmentsCount} <span className="text-sm text-white/20">/ {selectedBox.cantidad}</span>
                  </span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#2ec4f1] transition-all duration-500"
                    style={{ width: `${(uniqueEquipmentsCount / selectedBox.cantidad) * 100}%` }}
                  />
                </div>
              </div>
              <div className="bg-[#2ec4f1]/10 rounded-2xl p-6 border border-[#2ec4f1]/20 flex flex-col justify-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#2ec4f1] mb-1">Estatus Bodega</span>
                <span className="text-lg font-black text-white">{selectedBox.status.toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/30">
          {/* Ocultar sección de escaneo si la caja ya está llena */}
          {uniqueEquipmentsCount < selectedBox.cantidad && (
            <>
              {/* Buscador Inteligente */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <QrCode className="w-5 h-5 text-[#2ec4f1]" />
                    <h4 className="text-sm font-black uppercase tracking-widest text-[#181c3a]">Pistoleo de Verificación</h4>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 italic">Sincronizado con Recepción / Backoffice</span>
                </div>
                <form onSubmit={onAddSN} className="flex gap-3">
                  <input
                    type="text"
                    autoFocus
                    className="flex-1 h-16 px-6 bg-white border-2 border-slate-100 rounded-2xl text-xl font-mono font-bold outline-none focus:border-[#2ec4f1] shadow-sm transition-all"
                    placeholder="Escanee SN del equipo..."
                    value={currentSN}
                    onChange={e => setCurrentSN(e.target.value)}
                  />
                  <Button type="submit" className="h-16 px-8 rounded-2xl shadow-lg shadow-[#181c3a]/10">
                    <ArrowRight className="w-6 h-6" />
                  </Button>
                </form>
              </div>

              {/* Detalle del Último Escaneo (Auto-fetch) */}
              {lastScannedInfo && (
                <div className="animate-rise-in">
                  <Card className="border-2 border-[#2ec4f1]/30 bg-white p-6 shadow-xl shadow-[#2ec4f1]/5">
                    <div className="flex items-start gap-4">
                      <div className="bg-[#2ec4f1]/10 p-3 rounded-2xl">
                        <Info className="w-6 h-6 text-[#2ec4f1]" />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Información de Origen</h4>
                              {lastScannedInfo.serviceOrder !== 'S/OS' && (
                                <Badge className="bg-amber-100 text-amber-700 font-black text-[9px] px-2 py-0.5 border-none">
                                  OS: {lastScannedInfo.serviceOrder}
                                </Badge>
                              )}
                            </div>
                            <h5 className="text-lg font-black text-[#181c3a] leading-none mb-1">
                              {lastScannedInfo.agency || lastScannedInfo.agencia}
                            </h5>
                            <span className="text-sm font-bold text-slate-500">
                              {lastScannedInfo.courier} • Piloto: {lastScannedInfo.driver || lastScannedInfo.piloto}
                            </span>
                          </div>
                          <Badge className="bg-emerald-100 text-emerald-700 border-none font-black">
                            ✓ VALIDADO
                          </Badge>
                        </div>

                        <div className="grid grid-cols-4 gap-2 border-t border-slate-100 pt-4">
                          {['s1', 's2', 's3', 's4'].map((key, idx) => (
                            <div key={key} className={`rounded-lg p-2 ${lastScannedInfo[key] ? 'bg-[#2ec4f1]/5 border border-[#2ec4f1]/20' : 'bg-slate-50 opacity-40'}`}>
                              <span className="block text-[8px] font-black text-slate-400 uppercase mb-0.5">S-{idx + 1}</span>
                              <span className="text-[10px] font-mono font-black text-[#181c3a] break-all">{lastScannedInfo[key] || '---'}</span>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-4 bg-slate-50 p-3 rounded-xl">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <div className="flex flex-col">
                              <span className="text-[8px] font-black text-slate-400 uppercase">Recibido en Guía</span>
                              <span className="text-[10px] font-bold text-slate-700">{lastScannedInfo.fechaGuia}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <PackageCheck className="w-3.5 h-3.5 text-[#2ec4f1]" />
                            <div className="flex flex-col">
                              <span className="text-[8px] font-black text-slate-400 uppercase">Auditado Recepción</span>
                              <span className="text-[10px] font-bold text-[#2ec4f1]">{lastScannedInfo.fechaRecepcion}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </>
          )}

          {/* Listado de Series en Caja - Tabla Detallada */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              Contenido de la Caja <span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> {selectedBox.series.length} Unidades
            </h4>

            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
              <table className="w-full text-left whitespace-nowrap">
                <thead>
                  <tr className="bg-[#181c3a] text-white">
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Fecha / Hora</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">No. Guía</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Piloto</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Courier</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Recibió</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Estatus</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Orden Servicio</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Ingreso</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Agencia CAC</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Tecnología</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Marca</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Modelo</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-1</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-2</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-3</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-4</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Material</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Lote</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedBox.series.map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.fechaHora || item.timestamp}</td>
                      <td className="px-4 py-3 text-[10px] font-mono font-bold text-[#181c3a]">{item.guia || item.agencia}</td>
                      <td className="px-4 py-3 text-[10px] font-medium text-slate-600">{item.piloto || '---'}</td>
                      <td className="px-4 py-3 text-[10px] font-medium text-slate-400">{item.origen || '---'}</td>
                      <td className="px-4 py-3 text-[10px] font-medium text-slate-600">{item.recibio || 'Admin'}</td>
                      <td className="px-4 py-3">
                        <span className="text-[9px] font-black tracking-widest bg-[#181c3a] text-white px-2 py-1 rounded-full">BODEGA PRINCIPAL</span>
                      </td>
                      <td className="px-4 py-3 text-[10px] font-black text-[#2ec4f1]">{item.ordenServicio || '---'}</td>
                      <td className="px-4 py-3">
                        <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-2 py-1 rounded-full">{item.ingreso || '1° Ingreso'}</span>
                      </td>
                      <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.agenciaCAC || '---'}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-[#2ec4f1]">{catTecnologias.find(t => t.id === item.tecnologia)?.name || item.tecnologia || '---'}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{catMarcas.find(b => b.id === item.marca)?.name || item.marca || '---'}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{catModelos.find(m => m.id === item.modelo)?.name || item.modelo || '---'}</td>
                      <td className="px-4 py-3">
                        {item.s1 || item.sn ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-black text-[#181c3a] rounded-md">{item.s1 || item.sn}</span> : <span className="text-slate-300">---</span>}
                      </td>
                      <td className="px-4 py-3">
                        {item.s2 ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-bold text-slate-600 rounded-md">{item.s2}</span> : <span className="text-slate-300">---</span>}
                      </td>
                      <td className="px-4 py-3">
                        {item.s3 ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-bold text-slate-600 rounded-md">{item.s3}</span> : <span className="text-slate-300">---</span>}
                      </td>
                      <td className="px-4 py-3">
                        {item.s4 ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-bold text-slate-600 rounded-md">{item.s4}</span> : <span className="text-slate-300">---</span>}
                      </td>
                      <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.material || '---'}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.lote || '---'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onShowTimeline(item)}
                            className="p-1.5 bg-slate-50 hover:bg-[#2ec4f1]/10 hover:text-[#2ec4f1] text-slate-400 rounded-lg transition-colors"
                            title="Historial"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <button className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-lg transition-colors" title="Ver Detalles">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-lg transition-colors" title="Editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-lg transition-colors" title="Imprimir Etiqueta">
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onRemoveUnit(item)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-lg transition-colors ml-1"
                            title="Eliminar de la caja"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
