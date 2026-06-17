// @ts-nocheck
import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Scan, Box, Printer, Pencil, Trash2, CheckCircle2, AlertCircle, Plus, FileText } from 'lucide-react';

export const PxReceptionTab = ({ 
  guideData, setGuideData, currentEntry, setCurrentEntry, systemPxProviders, 
  systemTechnologies, filteredBrands, filteredModels, handleAddCaja, manifestItems, 
  scannedSeries, setScannedSeries, selectedBoxForScan, setSelectedBoxForScan, printBoxLabel, 
  setManifestItems, handleFinalizePX, handleAddSN_PX, currentScans, setCurrentScans, 
  systemModels, moduleMode 
}: any) => {
  return (
    <>
        <div className="grid lg:grid-cols-12 gap-8 animate-rise-in">
          <div className="lg:col-span-4 xl:col-span-3 space-y-4">
            <Card className="border-l-4 border-l-[#2ec4f1]">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-[#2ec4f1]" />
                  <h3 className="text-sm font-black uppercase tracking-widest">Datos del Documento</h3>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Número de Pedido</label>
                      <input 
                        type="text" 
                        placeholder="Ej: 8000XXXX"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                        value={guideData.sap}
                        onChange={(e) => setGuideData({...guideData, sap: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">DOC Referencia</label>
                      <input 
                        type="text" 
                        placeholder="Ej: REF-1234"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                        value={guideData.docReferencia}
                        onChange={(e) => setGuideData({...guideData, docReferencia: e.target.value})}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Proveedor PX</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                      value={guideData.proveedorPx}
                      onChange={(e) => setGuideData({...guideData, proveedorPx: e.target.value})}
                    >
                      {systemPxProviders.map((p: any) => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">No. Guía (Opcional)</label>
                      <input 
                        type="text" 
                        placeholder="Autogenerado"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                        value={guideData.guia}
                        onChange={(e) => setGuideData({...guideData, guia: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Piloto (Opcional)</label>
                      <input 
                        type="text" 
                        placeholder="Nombre"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                        value={guideData.piloto}
                        onChange={(e) => setGuideData({...guideData, piloto: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Courier (Opcional)</label>
                    <input 
                      type="text" 
                      placeholder="Empresa Courier"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                      value={guideData.courier}
                      onChange={(e) => setGuideData({...guideData, courier: e.target.value})}
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Tecnología</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                      value={currentEntry.tecnologia}
                      onChange={(e) => setCurrentEntry({...currentEntry, tecnologia: e.target.value, marca: '', modelo: ''})}
                    >
                      <option value="">Seleccione...</option>
                      {systemTechnologies.map((t: any) => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Marca</label>
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                        value={currentEntry.marca}
                        onChange={(e) => setCurrentEntry({...currentEntry, marca: e.target.value, modelo: ''})}
                      >
                        <option value="">Seleccione...</option>
                        {filteredBrands.map((b: any) => (
                          <option key={b.id} value={b.name}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Modelo</label>
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                        value={currentEntry.modelo}
                        onChange={(e) => setCurrentEntry({...currentEntry, modelo: e.target.value})}
                      >
                        <option value="">Seleccione...</option>
                        {filteredModels.map((m: any) => (
                          <option key={m.id} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Cantidad Esperada</label>
                    <input 
                      type="number" 
                      min="1"
                      placeholder="Ej: 50"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-[#2ec4f1]"
                      value={currentEntry.totalEsperado || ''}
                      onChange={(e) => setCurrentEntry({...currentEntry, totalEsperado: parseInt(e.target.value) || 0})}
                    />
                  </div>

                  <Button 
                    variant="outline" 
                    onClick={handleAddCaja}
                    className="w-full border-dashed h-12 text-[10px] uppercase font-black tracking-widest hover:bg-[#2ec4f1]/5 hover:border-[#2ec4f1] transition-all"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Crear Caja
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="bg-white border-2 border-slate-100 shadow-xl overflow-hidden">
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Control de Cajas</h3>
                  <Badge variant="blue" className="bg-[#2ec4f1]/10 text-[#2ec4f1] border-none font-black">{manifestItems.length} Cajas</Badge>
                </div>
                
                <div className="space-y-1 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {manifestItems.map((item: any) => {
                    const received = scannedSeries.filter(s => s.boxCode === item.boxCode).length;
                    const pending = item.totalEsperado - received;
                    const isComplete = received >= item.totalEsperado && item.totalEsperado > 0;
                    const isSelected = selectedBoxForScan === item.boxCode;

                    return (
                      <div 
                        key={item.id} 
                        onClick={() => setSelectedBoxForScan(item.boxCode)}
                        className={`group relative py-4 px-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-all rounded-xl cursor-pointer ${isSelected ? 'bg-slate-100 ring-2 ring-[#2ec4f1]/50 ring-inset shadow-inner' : ''}`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-black uppercase tracking-tighter ${isSelected ? 'text-[#2ec4f1]' : 'text-slate-400'}`}>Caja: {item.boxCode}</span>
                              {isComplete && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[#2ec4f1] animate-pulse" />}
                            </div>
                            <h4 className="text-sm font-black text-[#181c3a] leading-none">{item.marca} {item.modelo}</h4>
                            <span className="text-[9px] font-bold text-[#2ec4f1] uppercase">{item.tecnologia}</span>
                          </div>
                          
                          <div className="text-right">
                            <div className="flex items-baseline justify-end gap-1">
                              <span className={`text-xl font-black ${isComplete ? 'text-emerald-500' : 'text-[#2ec4f1]'}`}>{received}</span>
                              <span className="text-[10px] font-bold text-slate-300">/ {item.totalEsperado}</span>
                            </div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                              {isComplete ? 'Completado' : `Faltan: ${pending}`}
                            </p>
                          </div>
                        </div>

                        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="text" 
                            placeholder="Nro. de Material" 
                            className="w-full bg-white border border-slate-200 rounded-md p-1.5 text-[10px] font-bold outline-none focus:border-[#2ec4f1] transition-colors"
                            value={item.material || ''}
                            onChange={(e) => {
                              const newItems = [...manifestItems];
                              const index = newItems.findIndex(i => i.id === item.id);
                              if (index !== -1) {
                                newItems[index].material = e.target.value;
                                setManifestItems(newItems);
                              }
                            }}
                          />
                        </div>
                        
                        <div className="absolute -right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              printBoxLabel(item);
                            }}
                            className="p-2 hover:text-[#2ec4f1] transition-all bg-white shadow-md rounded-full border border-slate-100"
                            title="Imprimir Etiqueta"
                          >
                            <Printer size={12} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const newQty = prompt("Nueva cantidad esperada:", item.totalEsperado.toString());
                              if (newQty && !isNaN(parseInt(newQty))) {
                                setManifestItems(manifestItems.map((i: any) => i.id === item.id ? { ...i, totalEsperado: parseInt(newQty) } : i));
                              }
                            }}
                            className="p-2 hover:text-[#2ec4f1] transition-all bg-white shadow-md rounded-full border border-slate-100"
                          >
                            <Pencil size={12} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setManifestItems(manifestItems.filter(i => i.id !== item.id));
                            }}
                            className="p-2 hover:text-rose-500 transition-all bg-white shadow-md rounded-full border border-slate-100"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  
                  {manifestItems.length === 0 && (
                    <div className="py-12 text-center">
                      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Box className="w-6 h-6 text-slate-200" />
                      </div>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Sin cajas creadadas</p>
                    </div>
                  )}
                </div>

                <div className="pt-4">
                  {manifestItems.length > 0 && scannedSeries.length < manifestItems.reduce((acc, curr) => acc + curr.totalEsperado, 0) && (
                    <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-500 rounded-xl p-3 flex items-center justify-center gap-2">
                      <AlertCircle className="w-5 h-5" />
                      <span className="text-xs font-black uppercase tracking-widest">
                        Faltan {manifestItems.reduce((acc, curr) => acc + curr.totalEsperado, 0) - scannedSeries.length} equipos para cuadrar la hoja de entrega.
                      </span>
                    </div>
                  )}
                  <Button 
                    variant="primary" 
                    onClick={handleFinalizePX}
                    disabled={scannedSeries.length === 0 || scannedSeries.length !== manifestItems.reduce((acc, curr) => acc + curr.totalEsperado, 0)}
                    className="w-full bg-[#181c3a] hover:bg-[#252b57] text-white h-14 font-black text-[11px] uppercase tracking-widest shadow-xl shadow-[#181c3a]/10 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Confirmar y Finalizar Recepción
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <div className={`lg:col-span-8 xl:col-span-9 transition-all duration-300 ${manifestItems.length === 0 ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
              {/* IZQUIERDA: Escáner y Progreso */}
              <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-6">
                <Card className="p-6 border-2 border-slate-100 shadow-xl shadow-slate-200/50">
                  <div className="mb-6">
                    <h3 className="text-[13px] font-black text-[#181c3a] uppercase tracking-widest">Escáner de Series</h3>
                  </div>
                  <form onSubmit={handleAddSN_PX} className="flex flex-col gap-5">
                    {(() => {
                      const box = manifestItems.find(i => i.boxCode === selectedBoxForScan);
                      const expectedScans = box ? (systemModels.find(m => m.name === box.modelo)?.series_count || (box.tecnologia === 'EMTA' ? 4 : 1)) : 1;
                      
                      return (
                        <div className="flex flex-col gap-4">
                          {Array.from({ length: expectedScans }).map((_, idx) => (
                            <div key={idx} className="space-y-2">
                              <label className="text-[10px] font-black uppercase text-slate-400">Serie {idx + 1} *</label>
                              <input 
                                id={`scan-input-${idx}`}
                                type="text" 
                                value={currentScans[idx]}
                                onChange={(e) => {
                                  const newScans = [...currentScans];
                                  newScans[idx] = e.target.value;
                                  setCurrentScans(newScans);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (idx < expectedScans - 1) {
                                      e.preventDefault();
                                      const nextInput = document.getElementById(`scan-input-${idx + 1}`);
                                      if (nextInput) nextInput.focus();
                                    }
                                  }
                                }}
                                placeholder={`Escanear Serie ${idx + 1}...`}
                                className="w-full h-12 px-4 bg-white border-2 border-slate-200 rounded-lg text-sm font-mono font-bold outline-none focus:border-[#2ec4f1] transition-colors shadow-inner"
                                autoFocus={idx === 0}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    <Button type="submit" className="w-full h-12 bg-[#181c3a] hover:bg-[#252b57] text-white text-[11px] uppercase tracking-widest font-black rounded-lg mt-2 shadow-lg shadow-[#181c3a]/20">
                      Registrar Equipo (Enter)
                    </Button>
                  </form>
                </Card>

                {(() => {
                  const box = manifestItems.find(i => i.boxCode === selectedBoxForScan);
                  const expected = box ? box.totalEsperado : 0;
                  const received = scannedSeries.filter(s => s.boxCode === selectedBoxForScan).length;
                  const progressPct = expected > 0 ? Math.min(100, Math.round((received / expected) * 100)) : 0;
                  return (
                    <Card className="p-6 border-2 border-slate-100 shadow-xl shadow-slate-200/50">
                      <div className="mb-4">
                        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Progreso de la Caja</h3>
                      </div>
                      <div className="flex items-end gap-2 mb-4">
                        <span className="text-3xl font-black text-[#181c3a] leading-none">{received}</span>
                        <span className="text-xs font-bold text-slate-400 mb-1">/ {expected} equipos</span>
                      </div>
                      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#181c3a] transition-all duration-500 ease-out" 
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </Card>
                  );
                })()}
              </div>

              {/* DERECHA: Tabla Contenido de Caja */}
              <div className="lg:col-span-8 xl:col-span-9">
                <Card padding="none" className="overflow-hidden h-full border-2 border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col">
                  <div className="bg-white border-b border-slate-100 p-5 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[11px] font-black text-[#181c3a] uppercase tracking-widest">Contenido de la Caja</h3>
                    </div>
                  </div>
                  <div className="overflow-x-auto flex-1 bg-white">
                    {(() => {
                      const box = manifestItems.find(i => i.boxCode === selectedBoxForScan);
                      const showMulti = box && (systemModels.find(m => m.name === box.modelo)?.series_count > 1 || box.tecnologia === 'EMTA');
                      return (
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead>
                            <tr className="bg-slate-50/80 border-b text-[10px] font-black uppercase text-slate-400">
                              <th className="px-6 py-4">S-1</th>
                              {showMulti && (
                                <>
                                  <th className="px-6 py-4">S-2</th>
                                  <th className="px-6 py-4">S-3</th>
                                  <th className="px-6 py-4">S-4</th>
                                </>
                              )}
                              <th className="px-6 py-4">Nro Material</th>
                              <th className="px-6 py-4">Caja</th>
                              <th className="px-6 py-4 text-right">Acción</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {scannedSeries.filter(s => s.boxCode === selectedBoxForScan).length === 0 && (
                              <tr>
                                <td colSpan={showMulti ? 7 : 4} className="px-6 py-16 text-center">
                                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Scan className="w-6 h-6 text-slate-200" />
                                  </div>
                                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                    {selectedBoxForScan ? `Sin series para ${selectedBoxForScan}` : 'Seleccione una caja para ver sus series'}
                                  </p>
                                </td>
                              </tr>
                            )}
                            {scannedSeries
                              .filter(s => s.boxCode === selectedBoxForScan)
                              .map((s: any) => (
                              <tr key={s.sn} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 font-mono font-black text-[#181c3a]">
                                  <div className="flex items-center gap-2 group/s1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    {s.sn}
                                    <button 
                                      onClick={() => {
                                        const newVal = prompt("Editar Serie 1:", s.sn);
                                        if (newVal && newVal.trim() !== '') {
                                          setScannedSeries(scannedSeries.map((x: any) => x.sn === s.sn ? { ...x, sn: newVal.trim() } : x));
                                        }
                                      }}
                                      className="opacity-0 group-hover/s1:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-[#2ec4f1] transition-all"
                                      title="Editar Serie 1"
                                    >
                                      <Pencil size={12} />
                                    </button>
                                  </div>
                                </td>
                                {showMulti && (
                                  <>
                                    <td className="px-6 py-4 font-mono text-slate-500">
                                      <div className="flex items-center gap-2 group/s2">
                                        <span>{s.s2 || '-'}</span>
                                        <button 
                                          onClick={() => {
                                            const newVal = prompt("Editar Serie 2:", s.s2 || '');
                                            if (newVal !== null) {
                                              setScannedSeries(scannedSeries.map((x: any) => x.sn === s.sn ? { ...x, s2: newVal.trim() } : x));
                                            }
                                          }}
                                          className="opacity-0 group-hover/s2:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-[#2ec4f1] transition-all"
                                          title="Editar Serie 2"
                                        >
                                          <Pencil size={12} />
                                        </button>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-slate-500">
                                      <div className="flex items-center gap-2 group/s3">
                                        <span>{s.s3 || '-'}</span>
                                        <button 
                                          onClick={() => {
                                            const newVal = prompt("Editar Serie 3:", s.s3 || '');
                                            if (newVal !== null) {
                                              setScannedSeries(scannedSeries.map((x: any) => x.sn === s.sn ? { ...x, s3: newVal.trim() } : x));
                                            }
                                          }}
                                          className="opacity-0 group-hover/s3:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-[#2ec4f1] transition-all"
                                          title="Editar Serie 3"
                                        >
                                          <Pencil size={12} />
                                        </button>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-slate-500">
                                      <div className="flex items-center gap-2 group/s4">
                                        <span>{s.s4 || '-'}</span>
                                        <button 
                                          onClick={() => {
                                            const newVal = prompt("Editar Serie 4:", s.s4 || '');
                                            if (newVal !== null) {
                                              setScannedSeries(scannedSeries.map((x: any) => x.sn === s.sn ? { ...x, s4: newVal.trim() } : x));
                                            }
                                          }}
                                          className="opacity-0 group-hover/s4:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-[#2ec4f1] transition-all"
                                          title="Editar Serie 4"
                                        >
                                          <Pencil size={12} />
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                )}
                                <td className="px-6 py-4 font-mono font-bold text-slate-500">{s.material || '-'}</td>
                                <td className="px-6 py-4 font-bold text-[#2ec4f1] text-[10px]">{s.boxCode}</td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex justify-end gap-1">
                                    <button 
                                      onClick={() => setScannedSeries(scannedSeries.filter(x => x.sn !== s.sn))}
                                      className="p-1.5 hover:bg-rose-50 rounded-lg group transition-colors"
                                      title="Eliminar Equipo"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-slate-300 group-hover:text-rose-500" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>


    </>
  );
};