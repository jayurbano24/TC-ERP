"use client";
// Force Rebuild - V3
import React, { useState } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { 
  Scan, 
  Database, 
  PackageSearch, 
  AlertTriangle, 
  CheckCircle2, 
  Layers, 
  Box,
  FileText,
  Search,
  ArrowRightCircle,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  ClipboardCheck,
  History,
  ArrowRight
} from 'lucide-react';

type Finding = {
  id: string;
  tipo: 'Inconsistencia Cantidad' | 'Serie Reimpresa' | 'Serie No Válida' | 'Equipo Dañado';
  sn: string;
  detalle: string;
};

export default function RecepcionPxPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');
  const [guideData, setGuideData] = useState<any>({
    sap: '',
    agencia: 'Monte Verdes',
  });

  const [currentEntry, setCurrentEntry] = useState({
    tecnologia: 'ONT / MODEM',
    marca: 'Huawei',
    modelo: 'HG8245H',
    totalEsperado: 0
  });

  const [manifestItems, setManifestItems] = useState<any[]>([]);
  const [selectedModelForScan, setSelectedModelForScan] = useState<string | null>(null);

  const [scannedSeries, setScannedSeries] = useState<any[]>([]);
  const [currentSN, setCurrentSN] = useState('');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [showFindingModal, setShowFindingModal] = useState(false);

  const handleAddSN = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSN || !selectedModelForScan) return;
    
    // Buscar la partida correspondiente al modelo seleccionado
    const item = manifestItems.find(i => i.modelo === selectedModelForScan);
    if (!item) return;

    // Validar cantidad máxima
    const scannedCount = scannedSeries.filter((s: any) => s.modelo === selectedModelForScan).length;
    if (scannedCount >= item.totalEsperado) {
      alert(`Límite alcanzado para el modelo ${selectedModelForScan}`);
      return;
    }

    if (scannedSeries.find((s: any) => s.sn === currentSN)) {
      alert("Serie ya escaneada");
      return;
    }

    setScannedSeries([
      { 
        sn: currentSN, 
        modelo: selectedModelForScan, 
        marca: item.marca,
        status: 'OS_GENERADA',
        timestamp: new Date().toLocaleTimeString()
      }, 
      ...scannedSeries
    ]);
    setCurrentSN('');
  };

  const handleRegisterFinding = (tipo: Finding['tipo']) => {
    const newFinding: Finding = {
      id: Math.random().toString(36).substr(2, 9),
      tipo,
      sn: currentSN || 'N/A',
      detalle: 'Hallazgo registrado durante recepción PX'
    };
    setFindings([...findings, newFinding]);
    setShowFindingModal(false);
    setCurrentSN('');
  };

  return (
    <ModulePage
      title="Recepción Planta Externa (PX)"
      category="Logística"
    >
      <div className="flex items-center gap-4 mb-8 border-b border-slate-100">
        <button 
          onClick={() => setActiveTab('scan')}
          className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'scan' ? 'text-[#181c3a]' : 'text-slate-300 hover:text-slate-400'}`}
        >
          <div className="flex items-center gap-2">
            <Scan className="w-4 h-4" />
            Ingreso de Equipos
          </div>
          {activeTab === 'scan' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#2ec4f1] rounded-t-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'history' ? 'text-[#181c3a]' : 'text-slate-300 hover:text-slate-400'}`}
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Historial de Recepciones
          </div>
          {activeTab === 'history' && <div className="absolute bottom-0 left-0 w-full h-full bg-[#2ec4f1]/5 rounded-t-full border-b-4 border-[#2ec4f1]" />}
          {activeTab === 'history' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#2ec4f1] rounded-t-full" />}
        </button>
      </div>

      {activeTab === 'scan' && (
        <div className="grid lg:grid-cols-12 gap-8 animate-rise-in">
        
        {/* Panel Izquierdo: Configuración y Status */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="border-l-4 border-l-[#2ec4f1]">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-[#2ec4f1]" />
                <h3 className="text-sm font-black uppercase tracking-widest">Datos del Documento</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Documento SAP</label>
                  <input 
                    type="text" 
                    placeholder="8000XXXX"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-[#2ec4f1]"
                    value={guideData.sap}
                    onChange={(e) => setGuideData({...guideData, sap: e.target.value})}
                  />
                </div>
                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Tecnología</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-[#2ec4f1]"
                      value={currentEntry.tecnologia}
                      onChange={(e) => setCurrentEntry({...currentEntry, tecnologia: e.target.value})}
                    >
                      <option value="ONT / MODEM">ONT / MODEM</option>
                      <option value="DECODIFICADOR">DECODIFICADOR</option>
                      <option value="ROUTER">ROUTER</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Cantidad</label>
                    <input 
                      type="number" 
                      placeholder="0"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-[#2ec4f1]"
                      value={currentEntry.totalEsperado || ''}
                      onChange={(e) => setCurrentEntry({...currentEntry, totalEsperado: parseInt(e.target.value) || 0})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Marca</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-[#2ec4f1]"
                      value={currentEntry.marca}
                      onChange={(e) => setCurrentEntry({...currentEntry, marca: e.target.value})}
                    >
                      <option value="Huawei">Huawei</option>
                      <option value="Nokia">Nokia</option>
                      <option value="ZTE">ZTE</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Modelo</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-[#2ec4f1]"
                      value={currentEntry.modelo}
                      onChange={(e) => setCurrentEntry({...currentEntry, modelo: e.target.value})}
                    >
                      <option value="HG8245H">HG8245H</option>
                      <option value="EG8145V5">EG8145V5</option>
                      <option value="G-2425-G">G-2425-G</option>
                    </select>
                  </div>
                </div>

                <Button 
                  variant="outline" 
                  className="w-full border-dashed border-2 border-slate-200 text-slate-500 hover:border-[#2ec4f1] hover:text-[#2ec4f1] hover:bg-[#2ec4f1]/5 font-black text-[10px] uppercase tracking-widest h-12"
                  onClick={() => {
                    if (currentEntry.totalEsperado <= 0) return alert("Ingrese una cantidad válida");
                    setManifestItems([...manifestItems, { ...currentEntry, id: Math.random().toString(36).substr(2, 9) }]);
                    if (!selectedModelForScan) setSelectedModelForScan(currentEntry.modelo);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar Partida al Manifiesto
                </Button>
                </div>
              </div>
          </Card>

          <Card className="bg-[#181c3a] text-white border-none">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Resumen de Carga</h3>
                <Layers className="w-4 h-4 text-[#2ec4f1]" />
              </div>
              <div className="space-y-3">
                {manifestItems.map(item => {
                  const count = scannedSeries.filter(s => s.modelo === item.modelo).length;
                  return (
                    <div key={item.id} className="bg-white/5 p-4 rounded-2xl border border-white/10 flex justify-between items-center group transition-all hover:bg-white/10">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-white/40 uppercase leading-none">{item.marca}</span>
                        <span className="text-[11px] font-black text-white">{item.modelo}</span>
                        <span className="text-[8px] font-medium text-[#2ec4f1] uppercase mt-1">{item.tecnologia}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-black text-[#2ec4f1]">{count}</span>
                        <span className="text-[10px] font-bold text-white/20 ml-1">/ {item.totalEsperado}</span>
                      </div>
                    </div>
                  );
                })}
                {manifestItems.length === 0 && (
                  <div className="py-4 text-center text-white/20 italic text-[10px] uppercase font-black">
                    Sin partidas agregadas
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-white/10">
                <Button 
                  variant="primary" 
                  className="w-full bg-[#2ec4f1] hover:bg-[#1fb0db] text-[#181c3a] h-12 shadow-lg shadow-[#2ec4f1]/20"
                  disabled={scannedSeries.length === 0}
                >
                  Confirmar y Finalizar Recepción
                </Button>
              </div>
            </div>
          </Card>

          {findings.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Hallazgos Registrados</h4>
              </div>
              {findings.map(f => (
                <div key={f.id} className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-start gap-3">
                  <div className="bg-rose-500 text-white p-1.5 rounded-lg">
                    <AlertTriangle className="w-3 h-3" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-rose-700 uppercase">{f.tipo}</p>
                    <p className="text-xs font-bold text-rose-900 font-mono mt-1">SN: {f.sn}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel Derecho: Escaneo y Listado */}
        <div className="lg:col-span-9 space-y-6">
          <Card className="p-8">
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Scan className="w-6 h-6 text-[#181c3a]" />
                  <h2 className="text-lg font-black text-[#181c3a]">Escaneo de Series (SN)</h2>
                </div>
                <Badge variant="blue">Modo: Ingreso Directo</Badge>
              </div>

              <form onSubmit={handleAddSN} className="flex gap-4">
                <div className="relative flex-1 group">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-[#2ec4f1] transition-colors" />
                  <input 
                    type="text" 
                    value={currentSN}
                    onChange={(e) => setCurrentSN(e.target.value)}
                    placeholder="Escanee serie del equipo..."
                    className="w-full h-16 pl-14 pr-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xl font-mono font-bold outline-none focus:border-[#2ec4f1] focus:bg-white transition-all"
                  />
                </div>
                <Button type="submit" className="h-16 px-10 rounded-2xl shadow-xl shadow-[#181c3a]/10">
                  <ArrowRightCircle className="w-6 h-6" />
                </Button>
              </form>

              <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-50">
                <span className="text-[10px] font-black text-slate-400 uppercase mr-2 mt-2">Acciones Rápidas:</span>
                <Button variant="outline" size="sm" onClick={() => setShowFindingModal(true)} className="border-rose-200 text-rose-500 hover:bg-rose-50">
                  Registrar Hallazgo
                </Button>
                <Button variant="outline" size="sm" className="border-amber-200 text-amber-600 hover:bg-amber-50">
                  Cambiar Modelo
                </Button>
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#2ec4f1]" />
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Resumen de Recepción</h3>
              </div>
              <Badge variant="blue" className="px-3 py-1">Auditando Guía: {guideData.guia || '---'}</Badge>
            </div>

            <Card padding="none" className="overflow-hidden border-2 border-slate-100 shadow-sm">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    <th className="px-6 py-4">Tecnología</th>
                    <th className="px-6 py-4">Marca / Modelo</th>
                    <th className="px-6 py-4 text-center">Recibido</th>
                    <th className="px-6 py-4 text-center">Esperado</th>
                    <th className="px-6 py-4 text-right">Progreso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {manifestItems.map((item) => {
                    const scannedForThis = scannedSeries.filter(s => s.modelo === item.modelo).length;
                    const isComplete = scannedForThis >= item.totalEsperado;
                    
                    return (
                      <tr 
                        key={item.id} 
                        className={`font-bold cursor-pointer transition-colors ${selectedModelForScan === item.modelo ? 'bg-[#2ec4f1]/5' : ''} ${isComplete ? 'bg-emerald-50/20' : 'hover:bg-slate-50'}`}
                        onClick={() => setSelectedModelForScan(item.modelo)}
                      >
                        <td className="px-6 py-4">
                          <span className="text-[#2ec4f1] font-black text-[10px] uppercase tracking-tighter">{item.tecnologia}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-slate-800">{item.marca}</span>
                            <span className="text-[10px] text-slate-400 font-medium">{item.modelo}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center text-sm font-black text-[#181c3a]">
                          {scannedForThis}
                        </td>
                        <td className="px-6 py-4 text-center text-sm font-black text-slate-400">
                          {item.totalEsperado}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-4">
                            <div className="flex flex-col items-end gap-1.5 flex-1">
                              <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full transition-all duration-500 ${isComplete ? 'bg-emerald-500' : 'bg-[#2ec4f1]'}`}
                                  style={{ width: `${Math.min((scannedForThis / item.totalEsperado) * 100, 100)}%` }}
                                />
                              </div>
                              <span className={`text-[9px] font-black ${isComplete ? 'text-emerald-500' : 'text-slate-400'}`}>
                                {isComplete ? '✓ COMPLETADO' : `${Math.round((scannedForThis / item.totalEsperado) * 100)}%`}
                              </span>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setManifestItems(manifestItems.filter(mi => mi.id !== item.id));
                              }}
                              className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                              title="Eliminar Partida"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {manifestItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-slate-300 italic text-[10px] font-bold uppercase tracking-widest">
                        Agregue una partida para comenzar
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </div>

          <Card padding="none" className="overflow-hidden border-none shadow-xl">
            <div className="bg-[#181c3a] p-4 flex justify-between items-center">
              <div className="flex items-center gap-2 text-white">
                <Box className="w-4 h-4 text-[#2ec4f1]" />
                <h3 className="text-[10px] font-black uppercase tracking-widest">Series Escaneadas Recientemente</h3>
              </div>
              <span className="text-[10px] font-black text-[#2ec4f1] bg-[#2ec4f1]/10 px-2 py-1 rounded">MODO: INGRESO DIRECTO</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <th className="px-6 py-3">#</th>
                    <th className="px-6 py-3">Serie (SN)</th>
                    <th className="px-6 py-3">Marca / Modelo</th>
                    <th className="px-6 py-3">Destino</th>
                    <th className="px-6 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {scannedSeries.map((sn, idx) => (
                    <tr key={sn.sn} className="hover:bg-slate-50 transition-colors animate-rise-in border-b border-slate-50">
                      <td className="px-4 py-2 text-slate-400 font-bold text-[10px]">{scannedSeries.length - idx}</td>
                      <td className="px-4 py-2 font-mono font-black text-slate-700 text-xs tracking-tighter">{sn.sn}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-600 text-[10px] leading-tight">{sn.marca}</span>
                          <span className="text-[8px] text-slate-400 leading-none">{sn.modelo}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="green" className="text-[8px] px-1.5 py-0 whitespace-nowrap">BODEGA CENTRAL</Badge>
                          <div className="flex items-center gap-1 text-emerald-500 animate-pulse">
                            <ClipboardCheck className="w-3 h-3" />
                            <span className="text-[7px] font-black uppercase tracking-widest">OS #{Math.floor(100000 + Math.random() * 900000)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            className="p-1 text-slate-400 hover:text-[#2ec4f1] hover:bg-[#2ec4f1]/10 rounded-md transition-all"
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => setScannedSeries(scannedSeries.filter(s => s.sn !== sn.sn))}
                            className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {scannedSeries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-300 italic">
                        <div className="flex flex-col items-center gap-2">
                          <Scan className="w-8 h-8 opacity-20" />
                          <p className="text-[10px] font-black uppercase tracking-widest">Esperando primer escaneo...</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    )}

      {activeTab === 'history' && (
        <div className="space-y-6 animate-rise-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-[#181c3a] p-2 rounded-xl">
                <History className="w-5 h-5 text-[#2ec4f1]" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[#181c3a]">Historial de Recepciones PX</h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest text-[8px]">Registros de auditoría finalizados</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="bg-white text-[10px] font-black uppercase tracking-widest">
                <ClipboardCheck className="w-3.5 h-3.5 mr-2" />
                Exportar Reporte
              </Button>
            </div>
          </div>

          <Card padding="none" className="overflow-hidden border-none shadow-xl">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#181c3a] text-white/40 text-[10px] font-black uppercase tracking-widest">
                  <th className="px-6 py-4">Fecha de Cierre</th>
                  <th className="px-6 py-4">Documento SAP</th>
                  <th className="px-6 py-4">Sede / Agencia</th>
                  <th className="px-6 py-4 text-center">Cant. Total</th>
                  <th className="px-6 py-4">Estatus</th>
                  <th className="px-6 py-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
                  { id: 1, fecha: '28/04/2024 14:30', sap: '80009981', sede: 'Monte Verdes', total: 120, status: 'Auditado' },
                  { id: 2, fecha: '28/04/2024 11:15', sap: '80009982', sede: 'San Isidro', total: 45, status: 'Auditado' },
                  { id: 3, fecha: '27/04/2024 09:00', sap: '80009983', sede: 'Monte Verdes', total: 230, status: 'Auditado' },
                ].map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-600">{row.fecha}</span>
                    </td>
                    <td className="px-6 py-4 font-mono font-black text-[#181c3a]">{row.sap}</td>
                    <td className="px-6 py-4">
                      <Badge variant="blue" className="text-[9px] px-2">{row.sede}</Badge>
                    </td>
                    <td className="px-6 py-4 text-center font-black text-slate-700">{row.total} u.</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-emerald-600">
                        <CheckCircle2 className="w-3 h-3" />
                        <span className="text-[9px] font-black uppercase tracking-widest">{row.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 text-slate-400 hover:text-[#2ec4f1] hover:bg-[#2ec4f1]/10 rounded-xl transition-all">
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* Modal Hallazgo Simulado */}
      {showFindingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-6">
          <Card className="max-w-md w-full shadow-2xl animate-rise-in">
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-rose-600">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-xl font-bold">Reportar Hallazgo</h3>
              </div>
              <p className="text-sm text-slate-500">Seleccione el tipo de incidencia detectada para la serie actual o bulto.</p>
              
              <div className="grid gap-3">
                {(['Inconsistencia Cantidad', 'Serie Reimpresa', 'Serie No Válida', 'Equipo Dañado'] as Finding['tipo'][]).map(tipo => (
                  <button 
                    key={tipo}
                    onClick={() => handleRegisterFinding(tipo)}
                    className="w-full p-4 rounded-xl border border-slate-200 text-left hover:border-rose-500 hover:bg-rose-50 transition-all group"
                  >
                    <span className="text-sm font-bold text-slate-700 group-hover:text-rose-700">{tipo}</span>
                  </button>
                ))}
              </div>
              
              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <Button variant="ghost" onClick={() => setShowFindingModal(false)}>Cancelar</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </ModulePage>
  );
}