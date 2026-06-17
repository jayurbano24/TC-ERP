import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Scan, Box, Printer, Pencil, Trash2, CheckCircle2, AlertCircle, Plus, FileText, ArrowRight, ArrowLeft, X, LayoutGrid } from 'lucide-react';

export const PxReceptionTab = ({ 
  guideData, setGuideData, currentEntry, setCurrentEntry, systemPxProviders, 
  systemTechnologies, filteredBrands, filteredModels, handleAddCaja, manifestItems, 
  scannedSeries, setScannedSeries, selectedBoxForScan, setSelectedBoxForScan, printBoxLabel, 
  setManifestItems, handleFinalizePX, handleAddSN_PX, currentScans, setCurrentScans, 
  systemModels, moduleMode, isReceptionStarted, setIsReceptionStarted, isSubmittingPX
}: any) => {

  const [activeBoxNum, setActiveBoxNum] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'dashboard' | 'box_detail'>('dashboard');

  // Funciones locales para el nuevo flujo
  const handleStartReception = () => {
    if (!guideData.sap || !guideData.proveedorPx) {
      alert("Por favor complete al menos el Número de Pedido y Proveedor PX");
      return;
    }
    setIsReceptionStarted(true);
    setViewMode('dashboard');
    // Si no hay cajas, creamos la primera caja vacía lógicamente en la UI
    // Pero en el nuevo flujo de Dashboard, podemos simplemente dejar que el usuario cree la caja 1 desde el Dashboard.
  };

  const handleCreateNewBox = () => {
    // Busca el máximo número de caja actual
    let maxNum = 0;
    manifestItems.forEach((i: any) => {
      const match = i.boxCode.match(/CAJA-(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    });
    
    // Si hay cajas vacías (lógicamente), se usan, de lo contrario se asume un nuevo CAJA-XXX basado en las que tengan items
    // Para simplificar, en este flujo las cajas "nacen" cuando se les agrega el primer lote, o podemos tener una lista separada.
    // Como manifestItems representa "Lotes", una caja sin lotes no existe en manifestItems.
    // Vamos a usar activeBoxNum para llevar el conteo.
    const nextNum = Math.max(maxNum, activeBoxNum) + 1;
    setActiveBoxNum(nextNum);
    const newBoxCode = `CAJA-${nextNum}`;
    
    // Entrar directamente a esa caja
    setSelectedBoxForScan(newBoxCode);
    setViewMode('box_detail');
  };

  const handleEnterBox = (boxCode: string) => {
    setSelectedBoxForScan(boxCode);
    setViewMode('box_detail');
  };

  const handleAddLotToActiveBox = () => {
    if (!currentEntry.tecnologia || !currentEntry.marca || !currentEntry.modelo || !currentEntry.totalEsperado) {
      alert("Por favor, complete tecnología, marca, modelo y cantidad esperada para este lote.");
      return;
    }
    
    const targetBoxCode = selectedBoxForScan || `CAJA-${activeBoxNum}`;

    setManifestItems([...manifestItems, {
      id: Math.random().toString(36).substr(2, 9),
      boxCode: targetBoxCode,
      ...currentEntry,
      material: ''
    }]);

    setSelectedBoxForScan(targetBoxCode);
    
    setCurrentEntry({
      ...currentEntry,
      totalEsperado: 0
    });
  };

  // Agrupar manifestItems por Caja para la vista
  const boxesMap = new Map();
  manifestItems.forEach((item: any) => {
    if (!boxesMap.has(item.boxCode)) {
      boxesMap.set(item.boxCode, []);
    }
    boxesMap.get(item.boxCode).push(item);
  });
  const uniqueBoxes = Array.from(boxesMap.keys());

  // Agregar la caja actualmente seleccionada a la lista si es nueva y aún no tiene items
  if (selectedBoxForScan && !boxesMap.has(selectedBoxForScan)) {
    uniqueBoxes.push(selectedBoxForScan);
    boxesMap.set(selectedBoxForScan, []);
  }

  // Si no ha iniciado, mostrar PASO 1
  if (!isReceptionStarted) {
    return (
      <div className="max-w-3xl mx-auto animate-rise-in mt-8">
        <Card className="border-l-4 border-l-[#2ec4f1] shadow-2xl">
          <div className="p-8 space-y-8">
            <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
              <div className="w-12 h-12 bg-[#2ec4f1]/10 rounded-full flex items-center justify-center">
                <FileText className="w-6 h-6 text-[#2ec4f1]" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[#181c3a] uppercase tracking-widest">Paso 1: Cabecera de Recepción</h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Ingrese los datos del documento y proveedor</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Número de Pedido *</label>
                <input 
                  type="text" 
                  placeholder="Ej: 8000XXXX"
                  className="w-full h-12 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all"
                  value={guideData.sap}
                  onChange={(e) => setGuideData({...guideData, sap: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">DOC Referencia</label>
                <input 
                  type="text" 
                  placeholder="Ej: REF-1234"
                  className="w-full h-12 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all"
                  value={guideData.docReferencia}
                  onChange={(e) => setGuideData({...guideData, docReferencia: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Proveedor PX *</label>
                <select 
                  className="w-full h-12 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all appearance-none"
                  value={guideData.proveedorPx}
                  onChange={(e) => setGuideData({...guideData, proveedorPx: e.target.value})}
                >
                  <option value="">Seleccione...</option>
                  {systemPxProviders.map((p: any) => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Cantidad Total Cajas (Aprox)</label>
                <input 
                  type="number" 
                  min="1"
                  className="w-full h-12 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all"
                  value={guideData.totalCajasEsperadas || 1}
                  onChange={(e) => setGuideData({...guideData, totalCajasEsperadas: parseInt(e.target.value) || 1})}
                />
              </div>


            </div>

            <div className="pt-6 border-t border-slate-100 flex justify-end">
              <Button 
                onClick={handleStartReception}
                className="bg-[#181c3a] hover:bg-[#252b57] text-white h-14 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-[#181c3a]/20 rounded-2xl flex items-center gap-3"
              >
                Iniciar Recepción <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ==========================================
  // PASO 2: VISTA DASHBOARD DE CAJAS
  // ==========================================
  if (viewMode === 'dashboard') {
    return (
      <div className="space-y-8 animate-rise-in">
        
        {/* Cabecera Resumen & Botón Cancelar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#181c3a] uppercase tracking-widest">Recepción en Curso</h2>
              <div className="flex gap-4 mt-1 text-xs font-bold text-slate-400 uppercase">
                <span>Pedido: {guideData.sap || 'N/A'}</span>
                <span>•</span>
                <span>Proveedor: {guideData.proveedorPx || 'N/A'}</span>
                <span>•</span>
                <span>Fecha: {new Date().toLocaleDateString('es-ES')}</span>
                <span>•</span>
                <span>REC: {guideData.guia || 'AUTOGENERADO'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              onClick={() => setIsReceptionStarted(false)}
              className="border-none text-slate-500 hover:text-rose-500 hover:bg-rose-50 font-black text-[11px] uppercase tracking-widest"
            >
              <X className="w-4 h-4 mr-1" /> Cancelar / Volver a Cabecera
            </Button>
            <Button 
              variant="primary" 
              onClick={handleFinalizePX}
              disabled={uniqueBoxes.length === 0 || scannedSeries.length === 0 || isSubmittingPX}
              className="bg-emerald-500 hover:bg-emerald-600 text-white h-12 px-6 font-black text-[11px] uppercase tracking-widest shadow-xl shadow-emerald-500/20 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" /> {isSubmittingPX ? 'Guardando...' : 'Finalizar Recepción'}
            </Button>
          </div>
        </div>

        {/* Resumen Global */}
        <div className="flex flex-col md:flex-row gap-6">
          <Card className="p-6 border-l-4 border-l-[#2ec4f1] shadow-md w-full md:max-w-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Cajas Abiertas</h3>
              <Box className="w-5 h-5 text-[#2ec4f1]" />
            </div>
            <div>
              <span className="text-4xl font-black text-[#181c3a]">{uniqueBoxes.length}</span>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                De {guideData.totalCajasEsperadas} esperadas
              </p>
            </div>
          </Card>

          <div className="flex-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-[#181c3a] uppercase tracking-widest flex items-center gap-2">
                <Box className="w-6 h-6 text-[#2ec4f1]" />
                Cajas Activas
              </h2>
              <Button 
                onClick={handleCreateNewBox}
                className="bg-[#181c3a] hover:bg-[#252b57] text-white font-black text-[10px] uppercase tracking-widest h-10 px-6 transition-all shadow-lg hover:shadow-xl"
              >
                <Plus className="w-4 h-4 mr-2" /> Nueva Caja
              </Button>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 h-full overflow-y-auto max-h-[500px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {uniqueBoxes.length === 0 && (
                  <div className="col-span-full py-20 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
                    <Box className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">Aún no hay cajas creadas</h4>
                    <p className="text-[11px] text-slate-400 mt-2">Haz clic en Nueva Caja para comenzar a escanear.</p>
                  </div>
                )}
            
            {uniqueBoxes.map((boxCode: string) => {
              const boxItems = boxesMap.get(boxCode) || [];
              const totalExpected = boxItems.reduce((acc: number, item: any) => acc + item.totalEsperado, 0);
              const received = scannedSeries.filter((s: any) => s.boxCode === boxCode).length;
              const isComplete = received >= totalExpected && totalExpected > 0;
              
              // Unique models in the box
              const uniqueModels = Array.from(new Set(boxItems.map((i: any) => `${i.marca} ${i.modelo}`)));

              return (
                <Card key={boxCode} className={`p-0 overflow-hidden shadow hover:shadow-md transition-all border-l-4 ${isComplete ? 'border-l-[#181c3a]' : totalExpected === 0 ? 'border-l-amber-400' : 'border-l-[#2ec4f1]'}`}>
                  <div className="p-3 flex justify-between items-start border-b border-slate-50">
                    <div>
                      <h4 className="text-sm font-black text-[#181c3a] leading-none">{boxCode}</h4>
                      <div className="mt-1.5 space-y-0.5">
                        {uniqueModels.length > 0 ? uniqueModels.map((m: string, idx: number) => (
                          <p key={idx} className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{m}</p>
                        )) : (
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Caja Vacía</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleEditBox(boxCode)} className="text-slate-300 hover:text-[#2ec4f1] transition-colors"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => handleDeleteBox(boxCode)} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                  <div className="bg-slate-50/50 p-3">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Items: {received} / {totalExpected}</span>
                      {isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-[#181c3a]" />}
                    </div>
                    <Button 
                      onClick={() => handleEnterBox(boxCode)}
                      className={`w-full font-black text-[9px] uppercase tracking-widest h-8 transition-colors ${
                        totalExpected === 0 
                          ? 'bg-amber-400 hover:bg-amber-500 text-white shadow-sm shadow-amber-400/20' // Vacia
                          : isComplete 
                            ? 'bg-[#181c3a] hover:bg-[#252b57] text-white shadow-sm shadow-[#181c3a]/20' // Llena
                            : 'bg-[#2ec4f1] hover:bg-[#1fb3e0] text-white shadow-sm shadow-[#2ec4f1]/20' // Parcial
                      }`}
                    >
                      Continuar Armado <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  </div>
);
  }

  // ==========================================
  // PASO 2: VISTA DETALLE DE CAJA (ARMADO)
  // ==========================================
  const targetBox = selectedBoxForScan || activeBoxCode;
  const boxItems = boxesMap.get(targetBox) || [];
  const totalExpected = boxItems.reduce((acc: number, item: any) => acc + item.totalEsperado, 0);
  const received = scannedSeries.filter((s: any) => s.boxCode === targetBox).length;
  const progressPct = totalExpected > 0 ? Math.min(100, Math.round((received / totalExpected) * 100)) : 0;

  return (
    <div className="space-y-6 animate-rise-in">
      <div className="flex items-center gap-4 mb-2">
        <Button 
          variant="outline" 
          onClick={() => setViewMode('dashboard')}
          className="border-none text-slate-500 hover:text-[#181c3a] hover:bg-slate-100 font-black text-[11px] uppercase tracking-widest h-10 px-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver a Cajas Activas
        </Button>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
        
        {/* COLUMNA IZQUIERDA: CREACIÓN DE LOTES Y RESUMEN */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-6">
          <Card className="border-l-4 border-l-[#2ec4f1] shadow-xl p-0 overflow-hidden">
            <div className="bg-[#181c3a] p-5 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <Box className="w-5 h-5 text-[#2ec4f1]" />
                <h3 className="text-sm font-black uppercase tracking-widest">Caja Activa</h3>
              </div>
              <Badge className="bg-white/10 text-white border-none font-black">{targetBox}</Badge>
            </div>

            <div className="p-5 space-y-6 bg-slate-50">
              <div className="space-y-4">
                <h4 className="text-[11px] font-black text-[#181c3a] uppercase tracking-widest border-b border-slate-200 pb-2">Agregar Lote a {targetBox}</h4>
                
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Tecnología</label>
                    <select 
                      className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[#2ec4f1] transition-colors"
                      value={currentEntry.tecnologia}
                      onChange={(e) => setCurrentEntry({...currentEntry, tecnologia: e.target.value, marca: '', modelo: ''})}
                    >
                      <option value="">Seleccione...</option>
                      {systemTechnologies.map((t: any) => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Marca</label>
                      <select
                        className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[#2ec4f1] transition-colors"
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
                        className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[#2ec4f1] transition-colors"
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
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Cant. Equipos</label>
                    <input 
                      type="number" 
                      min="1"
                      placeholder="Ej: 50"
                      className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[#2ec4f1] transition-colors"
                      value={currentEntry.totalEsperado || ''}
                      onChange={(e) => setCurrentEntry({...currentEntry, totalEsperado: parseInt(e.target.value) || 0})}
                    />
                  </div>

                  <Button 
                    onClick={handleAddLotToActiveBox}
                    className="w-full h-12 mt-2 bg-[#181c3a] hover:bg-[#252b57] text-white text-[11px] uppercase font-black tracking-widest rounded-lg shadow-lg shadow-[#181c3a]/20"
                  >
                    + Agregar Lote
                  </Button>
                </div>
              </div>

              {/* Lotes Agregados */}
              <div className="pt-4 border-t border-slate-200">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Lotes en la Caja</h4>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                  {boxItems.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic">No hay lotes configurados.</p>
                  ) : (
                    boxItems.map((item: any) => (
                      <div key={item.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm">
                        <div>
                          <p className="text-[11px] font-black text-[#181c3a]">{item.marca} {item.modelo}</p>
                          <p className="text-[9px] font-bold text-[#2ec4f1] uppercase">{item.tecnologia}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-slate-500">{item.totalEsperado} und</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </Card>
        </div>

        {/* COLUMNA DERECHA: ESCÁNER Y TABLA */}
        <div className="lg:col-span-8 xl:col-span-9 transition-all duration-300">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
            
            {/* Escáner */}
            <div className="lg:col-span-4 xl:col-span-4 flex flex-col gap-6">
              <Card className="p-6 border-2 border-slate-100 shadow-xl shadow-slate-200/50">
                <div className="mb-6 flex justify-between items-center">
                  <h3 className="text-[13px] font-black text-[#181c3a] uppercase tracking-widest">Escáner de Series</h3>
                </div>
                <form onSubmit={handleAddSN_PX} className="flex flex-col gap-5">
                  {(() => {
                    const lastItem = boxItems[boxItems.length - 1];
                    const expectedScans = lastItem ? (systemModels.find((m: any) => m.name === lastItem.modelo)?.series_count || (lastItem.tecnologia === 'EMTA' ? 4 : 1)) : 1;
                    
                    return (
                      <div className="flex flex-col gap-5">
                        {Array.from({ length: expectedScans }).map((_, idx) => {
                          const currentVal = currentScans[idx] || '';
                          const isDuplicate = currentVal.trim() !== '' && (
                            scannedSeries.some((s: any) => 
                              s.sn === currentVal.trim().toUpperCase() || 
                              s.s2 === currentVal.trim().toUpperCase() || 
                              s.s3 === currentVal.trim().toUpperCase() || 
                              s.s4 === currentVal.trim().toUpperCase()
                            ) ||
                            currentScans.some((v: string, i: number) => i !== idx && v.trim().toUpperCase() === currentVal.trim().toUpperCase())
                          );

                          return (
                            <div key={idx} className="space-y-2 relative">
                              <label className="text-[10px] font-black uppercase text-slate-400">Serie {idx + 1} *</label>
                              <input 
                                id={`scan-input-${idx}`}
                                type="text" 
                                value={currentVal}
                                onChange={(e) => {
                                  const newScans = [...currentScans];
                                  newScans[idx] = e.target.value;
                                  setCurrentScans(newScans);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (isDuplicate) {
                                      e.preventDefault();
                                      return;
                                    }
                                    if (idx < expectedScans - 1) {
                                      e.preventDefault();
                                      const nextInput = document.getElementById(`scan-input-${idx + 1}`);
                                      if (nextInput) nextInput.focus();
                                    }
                                  }
                                }}
                                placeholder={`Escanear Serie ${idx + 1}...`}
                                className={`w-full h-12 px-4 bg-white border-2 rounded-lg text-sm font-mono font-bold outline-none transition-colors shadow-inner uppercase ${isDuplicate ? 'border-rose-500 text-rose-600 focus:border-rose-500 bg-rose-50' : 'border-slate-200 focus:border-[#2ec4f1]'}`}
                                autoFocus={idx === 0}
                                disabled={boxItems.length === 0}
                              />
                              {isDuplicate && (
                                <span className="text-[10px] text-rose-500 font-bold absolute -bottom-4 left-0">
                                  ⚠️ Esta serie ya fue escaneada
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  <Button 
                    type="submit" 
                    disabled={boxItems.length === 0}
                    className="w-full h-12 bg-[#181c3a] hover:bg-[#252b57] text-white text-[11px] uppercase tracking-widest font-black rounded-lg mt-2 shadow-lg shadow-[#181c3a]/20 disabled:opacity-50"
                  >
                    Registrar Equipo (Enter)
                  </Button>
                </form>
              </Card>

              {/* Progreso */}
              <Card className="p-6 border-2 border-slate-100 shadow-xl shadow-slate-200/50">
                <div className="mb-4">
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Progreso: {targetBox}</h3>
                </div>
                <div className="flex items-end gap-2 mb-4">
                  <span className="text-4xl font-black text-[#181c3a] leading-none">{received}</span>
                  <span className="text-sm font-bold text-slate-400 mb-1">/ {totalExpected} equipos</span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-400 transition-all duration-500 ease-out" 
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </Card>
            </div>

            {/* Tabla Series */}
            <div className="lg:col-span-8 xl:col-span-8">
              <Card padding="none" className="overflow-hidden h-full border-2 border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col">
                <div className="bg-white border-b border-slate-100 p-5 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[11px] font-black text-[#181c3a] uppercase tracking-widest">Equipos Escaneados</h3>
                  </div>
                </div>
                <div className="overflow-x-auto flex-1 bg-white">
                  {(() => {
                    const showMulti = boxItems.some((item: any) => (systemModels.find((m: any) => m.name === item.modelo)?.series_count > 1 || item.tecnologia === 'EMTA'));
                    
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
                            <th className="px-6 py-4 text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {scannedSeries.filter((s: any) => s.boxCode === targetBox).length === 0 && (
                            <tr>
                              <td colSpan={showMulti ? 5 : 2} className="px-6 py-20 text-center">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <Scan className="w-8 h-8 text-slate-300" />
                                </div>
                                <h4 className="text-[12px] font-black text-[#181c3a] uppercase tracking-widest">La caja está vacía</h4>
                                <p className="text-[10px] font-bold text-slate-400 mt-2">
                                  {boxItems.length > 0 ? 'Agregue lotes y escanee equipos.' : 'Primero agregue un lote a la caja en el panel lateral.'}
                                </p>
                              </td>
                            </tr>
                          )}
                          {scannedSeries
                            .filter((s: any) => s.boxCode === targetBox)
                            .map((s: any, idx: number) => (
                            <tr key={`${s.sn}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 font-mono font-black text-[#181c3a]">
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  {s.sn}
                                </div>
                              </td>
                              {showMulti && (
                                <>
                                  <td className="px-6 py-4 font-mono text-slate-500">{s.s2 || '-'}</td>
                                  <td className="px-6 py-4 font-mono text-slate-500">{s.s3 || '-'}</td>
                                  <td className="px-6 py-4 font-mono text-slate-500">{s.s4 || '-'}</td>
                                </>
                              )}
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-1">
                                  <button 
                                    onClick={() => setScannedSeries(scannedSeries.filter((x: any) => x.sn !== s.sn))}
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
    </div>
  );
};