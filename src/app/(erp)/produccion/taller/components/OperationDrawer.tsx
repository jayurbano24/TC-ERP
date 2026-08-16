'use client';

import { memo, useMemo } from 'react';
import { Card, Button, Badge, notify } from '@/components/ui';
import {
  Stethoscope, Box, ChevronDown, AlertCircle, Wrench, Activity,
  RefreshCw, XCircle, Loader2, Printer,
} from 'lucide-react';
import {
  isKaonQcPrintableModel,
  printKaonQcLabel,
} from '../printKaonQcLabel';

type Props = {
  activeTab: string;
  selectedForOperation: any;
  setSelectedForOperation: (v: any) => void;
  diagnosticResult: string | null;
  setDiagnosticResult: (v: string | null) => void;
  diagnosticNotes: string;
  setDiagnosticNotes: (v: string) => void;
  setFunctionalChecks: (v: Record<string, 'OPERATIVO' | 'NO_OPERATIVO'>) => void;
  cosmeticClass: string | null;
  setCosmeticClass: (v: string | null) => void;
  labelStatus: string | null;
  setLabelStatus: (v: string | null) => void;
  qcEtiqueta: string | null;
  setQcEtiqueta: (v: string | null) => void;
  qcSello: string | null;
  setQcSello: (v: string | null) => void;
  qcChecklist: string | null;
  setQcChecklist: (v: string | null) => void;
  qcLegible: string | null;
  setQcLegible: (v: string | null) => void;
  reacondTests: string[];
  setReacondTests: (v: string[]) => void;
  selectedDiagnostics: string[];
  setSelectedDiagnostics: (v: string[]) => void;
  isCosmeticOpen: boolean;
  setIsCosmeticOpen: (v: boolean) => void;
  isLabelOpen: boolean;
  setIsLabelOpen: (v: boolean) => void;
  isDiagnosticsOpen: boolean;
  setIsDiagnosticsOpen: (v: boolean) => void;
  lockedCosmetic: string | null;
  lockedDiagProfile: string | null;
  lockedDiagnostics: string[];
  lockedRepProfile: string | null;
  lockedRepairs: string[];
  loading: boolean;
  catDiagnosticos: any[];
  catReparaciones: any[];
  catTecnologias: any[];
  catModelos: any[];
  catReacondicionadoTests: any[];
  handleCompleteOperation: () => void;
};

/**
 * C1: drawer de ejecución de operación (diagnóstico/reparación/QC/reacondicionado)
 * extraído del monolito produccion/taller y memoizado.
 * Todo el estado vive en el padre; la lógica de guardado (handleCompleteOperation)
 * también permanece en el padre y se recibe como prop.
 */
export const OperationDrawer = memo(function OperationDrawer({
  activeTab,
  selectedForOperation,
  setSelectedForOperation,
  diagnosticResult,
  setDiagnosticResult,
  diagnosticNotes,
  setDiagnosticNotes,
  setFunctionalChecks,
  cosmeticClass,
  setCosmeticClass,
  labelStatus,
  setLabelStatus,
  qcEtiqueta,
  setQcEtiqueta,
  qcSello,
  setQcSello,
  qcChecklist,
  setQcChecklist,
  qcLegible,
  setQcLegible,
  reacondTests,
  setReacondTests,
  selectedDiagnostics,
  setSelectedDiagnostics,
  isCosmeticOpen,
  setIsCosmeticOpen,
  isLabelOpen,
  setIsLabelOpen,
  isDiagnosticsOpen,
  setIsDiagnosticsOpen,
  lockedCosmetic,
  lockedDiagProfile,
  lockedDiagnostics,
  lockedRepProfile,
  lockedRepairs,
  loading,
  catDiagnosticos,
  catReparaciones,
  catTecnologias,
  catModelos,
  catReacondicionadoTests,
  handleCompleteOperation,
}: Props) {
  const canPrintKaonLabel = useMemo(() => {
    if (!selectedForOperation || Array.isArray(selectedForOperation)) return false;
    if (activeTab !== 'qc') return false;
    return isKaonQcPrintableModel(
      String(selectedForOperation.modelo || ''),
      String(selectedForOperation.marca || '')
    );
  }, [activeTab, selectedForOperation]);

  const handlePrintKaonLabel = async () => {
    if (!selectedForOperation || Array.isArray(selectedForOperation)) return;
    try {
      await printKaonQcLabel(
        {
          modelo: String(selectedForOperation.modelo || ''),
          marca: String(selectedForOperation.marca || ''),
          sn: String(selectedForOperation.sn || ''),
          all_sns: Array.isArray(selectedForOperation.all_sns)
            ? selectedForOperation.all_sns.map((s: string) => String(s || ''))
            : [],
        },
        {
          onEmpty: () =>
            notify.warning('Sin series para imprimir', {
              description: 'El equipo no tiene serial/MAC capturados.',
            }),
          onUnsupportedModel: () =>
            notify.warning('Modelo no soportado', {
              description: 'La impresión de label aplica solo a CG-2200 y CG-3000.',
            }),
          onBarcodeError: () =>
            notify.error('No se pudo generar la etiqueta de impresión.'),
        }
      );
    } catch (err) {
      console.error(err);
      notify.error('Error al imprimir label');
    }
  };

  return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#181c3a]/40 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
          <Card className="max-w-2xl w-full max-h-[92vh] my-2 sm:my-4 shadow-xl animate-rise-in p-0 flex flex-col overflow-hidden">
            <div className={`px-3 py-2.5 text-white flex items-start justify-between gap-2 shrink-0 ${
              activeTab === 'diagnostico' ? 'bg-amber-500' :
              activeTab === 'reparacion' ? 'bg-blue-500' :
              activeTab === 'reacondicionado' ? 'bg-emerald-500' :
              activeTab === 'qc' ? 'bg-purple-500' :
              activeTab === 'l3' ? 'bg-orange-500' :
              activeTab === 'scraps' ? 'bg-rose-500' :
              activeTab === 'listo' ? 'bg-teal-500' :
              'bg-[#181c3a]'
            }`}>
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm shrink-0">
                  <Stethoscope className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <Badge variant="blue" className="bg-white/20 text-white font-black text-[8px] uppercase border-none backdrop-blur-sm px-1.5 py-0">
                      {Array.isArray(selectedForOperation)
                        ? `MASIVO · ${selectedForOperation.length} eq.`
                        : selectedForOperation.id}
                    </Badge>
                    <span className="text-[8px] font-bold text-white/90 uppercase tracking-wider">
                      {activeTab === 'diagnostico' ? 'Diagnóstico' : activeTab === 'reparacion' ? 'Reparación' : activeTab === 'qc' ? 'QC' : activeTab === 'reacondicionado' ? 'Reacond.' : 'Operación'}
                    </span>
                    
                    {!Array.isArray(selectedForOperation) && (
                      <div className="flex gap-1 flex-wrap">
                        <Badge variant="slate" className={`border-none font-black text-[7px] uppercase px-1.5 py-0 ${selectedForOperation.ingress_count > 1 ? 'bg-amber-500 text-white' : 'bg-black/40 text-white'}`}>
                          {selectedForOperation.ingress_count === 1 ? '1° ing.' : `${selectedForOperation.ingress_count}° ing.`}
                        </Badge>
                        <Badge variant="slate" className="bg-black/40 text-white border-none font-black text-[7px] uppercase px-1.5 py-0">
                          {selectedForOperation.etapa}
                        </Badge>
                      </div>
                    )}
                  </div>
                  <h3 className="text-sm font-black leading-tight truncate">
                    {Array.isArray(selectedForOperation) ? 'Varios equipos' : selectedForOperation.modelo}
                    <span className="text-white/90 font-mono text-[10px] font-bold block sm:inline sm:ml-2 truncate">
                      {Array.isArray(selectedForOperation) ? '' : selectedForOperation.sn}
                    </span>
                  </h3>
                </div>
              </div>
              <button 
                onClick={() => {
                  setSelectedForOperation(null);
                  setDiagnosticResult(null);
                  setDiagnosticNotes('');
                  setFunctionalChecks({});
                  setCosmeticClass(null);
                  setLabelStatus(null);
                  setQcEtiqueta(null);
                  setQcSello(null);
                  setQcChecklist(null);
                  setQcLegible(null);
                  setReacondTests([]);
                }}  
                className="text-white/80 hover:text-white p-1 hover:bg-white/20 rounded-lg transition-all shrink-0 text-lg leading-none"
              >✕</button>
            </div>

            <div className="p-3 bg-slate-50/50 space-y-3 overflow-y-auto flex-1 min-h-0">


              {/* 2. CLASIFICACIÓN COSMÉTICA */}
              {activeTab === 'diagnostico' ? (
                <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 transition-all">
                  <button 
                    onClick={() => setIsCosmeticOpen(!isCosmeticOpen)}
                    className="w-full flex items-center justify-between group outline-none"
                  >
                    <h4 className="text-[9px] font-black uppercase tracking-wider text-amber-500 flex items-center gap-2">
                      <Box className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      2. Clasificación Cosmética
                    </h4>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isCosmeticOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isCosmeticOpen && (
                    <div className="grid grid-cols-4 gap-2 border-t border-slate-100 pt-3 mt-3 animate-in slide-in-from-top-2 fade-in duration-200">
                    {[
                      { val: 'A', label: 'Excelente' },
                      { val: 'B', label: 'Bueno' },
                      { val: 'C', label: 'Regular' },
                      { val: 'D', label: 'Dañado' },
                    ].map((item) => (
                      <button 
                        key={item.val}
                        onClick={() => setCosmeticClass(item.val)}
                        className={`p-2 rounded-lg border text-center transition-all flex flex-col items-center justify-center gap-0.5 ${cosmeticClass === item.val ? 'border-amber-500 bg-amber-50 shadow-sm' : 'border-slate-200 bg-transparent hover:border-amber-400'}`}
                      >
                        <span className={`text-base font-black ${cosmeticClass === item.val ? 'text-amber-500' : 'text-slate-600'}`}>{item.val}</span>
                        <span className={`text-[8px] font-bold ${cosmeticClass === item.val ? 'text-amber-500' : 'text-slate-400'}`}>{item.label}</span>
                      </button>
                    ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 p-3 rounded-xl shadow-sm border border-slate-200">
                  <h4 className="text-[9px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-2 mb-4">
                    <Box className="w-4 h-4" />
                    Clasificación Cosmética Inicial (Bloqueada)
                  </h4>
                  <div className="flex items-center gap-4">
                    {lockedCosmetic ? (
                      <div className="px-6 py-3 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center gap-3">
                        <span className="text-xl font-black text-slate-600">{lockedCosmetic}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {lockedCosmetic === 'A' ? 'Excelente' : lockedCosmetic === 'B' ? 'Bueno' : lockedCosmetic === 'C' ? 'Regular' : 'Dañado'}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">NO HAY CLASIFICACIÓN REGISTRADA</p>
                    )}
                  </div>
                </div>
              )}



              {/* 3. ESTADO DE LA ETIQUETA DE DATOS */}
              {activeTab === 'diagnostico' && (
              <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 transition-all">
                <button 
                  onClick={() => setIsLabelOpen(!isLabelOpen)}
                  className="w-full flex items-center justify-between group outline-none"
                >
                  <h4 className="text-[9px] font-black uppercase tracking-wider text-amber-500 flex items-center gap-2">
                    <Badge className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    3. Estado de la Etiqueta de Datos
                  </h4>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isLabelOpen ? 'rotate-180' : ''}`} />
                </button>

                {isLabelOpen && (
                  <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 mt-3 animate-in slide-in-from-top-2 fade-in duration-200">
                  <button 
                    onClick={() => setLabelStatus('OK')}
                    className={`p-2 rounded-lg border text-center transition-all flex items-center justify-center ${labelStatus === 'OK' ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-transparent hover:border-amber-400'}`}
                  >
                    <span className={`text-[9px] font-black uppercase ${labelStatus === 'OK' ? 'text-emerald-600' : 'text-slate-500'}`}>Etiqueta OK</span>
                  </button>
                  <button 
                    onClick={() => setLabelStatus('MAL')}
                    className={`p-2 rounded-lg border text-center transition-all flex items-center justify-center ${labelStatus === 'MAL' ? 'border-rose-400 bg-rose-50 shadow-sm' : 'border-slate-200 bg-transparent hover:border-amber-400'}`}
                  >
                    <span className={`text-[9px] font-black uppercase ${labelStatus === 'MAL' ? 'text-rose-600' : 'text-slate-500'}`}>Etiqueta mal</span>
                  </button>
                  </div>
                )}
              </div>
              )}

              {/* DIAGNÓSTICO PREVIO (SOLO EN REPARACIÓN/OTROS) */}
              {activeTab !== 'diagnostico' && (
                <div className="bg-slate-50 p-3 rounded-xl shadow-sm border border-slate-200">
                  <h4 className="text-[9px] font-black uppercase tracking-wider text-slate-500 mb-4 flex flex-wrap items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Diagnóstico Inicial (Bloqueado)
                    {lockedDiagProfile && <span className="ml-auto text-[9px] font-black text-slate-100 bg-slate-800 px-3 py-1 rounded-full shadow-sm tracking-widest border border-slate-900">POR: {lockedDiagProfile.toUpperCase()}</span>}
                  </h4>
                  <div className="flex flex-col gap-2">
                    {lockedDiagnostics && lockedDiagnostics.length > 0 ? (
                      lockedDiagnostics.map((id: string) => {
                        const diag = catDiagnosticos.find(d => d.id === id);
                        return (
                          <div key={id} className="bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-xl shadow-sm flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                            <span className="text-[11px] font-black uppercase tracking-widest">{diag ? diag.nombre : id}</span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">NO HAY DIAGNÓSTICOS REGISTRADOS</p>
                    )}
                  </div>
                </div>
              )}

              {/* REPARACIONES PREVIAS (SOLO EN QC O POSTERIOR) */}
              {activeTab !== 'diagnostico' && activeTab !== 'reparacion' && (
                <div className="bg-slate-50 p-3 rounded-xl shadow-sm border border-slate-200 mt-2">
                  <h4 className="text-[9px] font-black uppercase tracking-wider text-blue-500 mb-4 flex flex-wrap items-center gap-2">
                    <Wrench className="w-4 h-4" />
                    Reparaciones Aplicadas (Bloqueado)
                    {lockedRepProfile && <span className="ml-auto text-[9px] font-black text-slate-100 bg-slate-800 px-3 py-1 rounded-full shadow-sm tracking-widest border border-slate-900">POR: {lockedRepProfile.toUpperCase()}</span>}
                  </h4>
                  <div className="flex flex-col gap-2">
                    {activeTab === 'reacondicionado' ? (
                      <div className="bg-white border border-blue-200 text-blue-700 px-4 py-3 rounded-xl shadow-sm flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                        <span className="text-[11px] font-black uppercase tracking-widest">MASTER RESET</span>
                      </div>
                    ) : lockedRepairs && lockedRepairs.length > 0 ? (
                      lockedRepairs.map((id: string) => {
                        const rep = catReparaciones.find(r => r.id === id);
                        return (
                          <div key={id} className="bg-white border border-blue-200 text-blue-700 px-4 py-3 rounded-xl shadow-sm flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                            <span className="text-[11px] font-black uppercase tracking-widest">{rep ? rep.nombre : id}</span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">NO HAY REPARACIONES REGISTRADAS</p>
                    )}
                  </div>
                </div>
              )}

              {/* 4. FALLAS O REPARACIONES */}
              {(activeTab === 'diagnostico' || activeTab === 'reparacion' || activeTab === 'l3') && (
              <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 transition-all">
                <button 
                  onClick={() => setIsDiagnosticsOpen(!isDiagnosticsOpen)}
                  className="w-full flex items-center justify-between group outline-none"
                >
                  <h4 className={`text-[9px] font-black uppercase tracking-wider flex items-center gap-2 ${activeTab === 'diagnostico' ? 'text-amber-500' : activeTab === 'l3' ? 'text-orange-500' : 'text-blue-500'}`}>
                    {activeTab === 'diagnostico' ? <AlertCircle className="w-4 h-4 group-hover:scale-110 transition-transform" /> : <Wrench className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                    {activeTab === 'diagnostico'
                      ? '4. Fallas Encontradas (Catálogo)'
                      : activeTab === 'l3'
                        ? '4. Reparaciones L3 (Catálogo)'
                        : '4. Reparaciones Aplicadas (Catálogo)'}
                  </h4>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isDiagnosticsOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isDiagnosticsOpen && (() => {
                  const availableRepairs = (() => {
                    if (activeTab === 'diagnostico') return [];
                    if (!lockedDiagnostics || lockedDiagnostics.length === 0) return catReparaciones;
                    
                    const matchingDiags = catDiagnosticos.filter(d => lockedDiagnostics.includes(d.id));
                    const allowedRepairIds = new Set(matchingDiags.flatMap(d => d.reparacionesIds || []));
                    
                    if (allowedRepairIds.size > 0) {
                      return catReparaciones.filter(r => allowedRepairIds.has(r.id));
                    }
                    return catReparaciones;
                  })();
                  
                  const optionsList = activeTab === 'diagnostico' ? catDiagnosticos : availableRepairs;

                  return (
                  <div className="mt-6 border-t border-slate-100 pt-6 animate-in slide-in-from-top-2 fade-in duration-200">
                    <p className="text-[10px] font-bold text-slate-400 mb-4 uppercase tracking-widest">
                      {activeTab === 'diagnostico' ? 'Seleccione hasta 3 diagnósticos' : 'Seleccione hasta 3 reparaciones'}
                    </p>
                    
                    <div className="flex flex-col gap-4">
                      <select
                        className={`w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-black uppercase text-slate-700 outline-none shadow-sm ${activeTab === 'diagnostico' ? 'focus:border-amber-400' : 'focus:border-blue-400'}`}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val && !selectedDiagnostics.includes(val)) {
                            if (selectedDiagnostics.length < 3) {
                              setSelectedDiagnostics([...selectedDiagnostics, val]);
                            } else {
                              notify.warning(`Solo puedes agregar un máximo de 3 ${activeTab === 'diagnostico' ? 'diagnósticos' : 'reparaciones'}.`);
                            }
                          }
                          e.target.value = ''; // reset
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>
                          {activeTab === 'diagnostico' ? 'SELECCIONAR FALLA DE LA LISTA...' : 'SELECCIONAR REPARACIÓN DE LA LISTA...'}
                        </option>
                        {optionsList.map(item => (
                          <option key={item.id} value={item.id} disabled={selectedDiagnostics.includes(item.id)}>
                            {item.nombre}
                          </option>
                        ))}
                      </select>

                      {optionsList.length === 0 && (
                         <span className="text-xs font-bold text-slate-400">
                           No hay {activeTab === 'diagnostico' ? 'diagnósticos' : 'reparaciones vinculadas'} configurados en el catálogo.
                         </span>
                      )}

                      <div className="flex flex-col gap-2">
                        {selectedDiagnostics.map(id => {
                          const item = optionsList.find(d => d.id === id);
                          if (!item) return null;
                          return (
                            <div key={id} className={`flex items-center justify-between border px-4 py-3 rounded-xl shadow-sm ${
                              activeTab === 'diagnostico' 
                                ? 'bg-amber-50 border-amber-200 text-amber-700' 
                                : 'bg-blue-50 border-blue-200 text-blue-700'
                            }`}>
                              <span className="text-[11px] font-black uppercase tracking-widest">{item.nombre}</span>
                              <button 
                                onClick={() => setSelectedDiagnostics(selectedDiagnostics.filter(sid => sid !== id))} 
                                className={`transition-colors ${activeTab === 'diagnostico' ? 'text-amber-500 hover:text-rose-500' : 'text-blue-500 hover:text-rose-500'}`}
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  );
                })()}
              </div>
              )}

              {/* FORMULARIO DE CONTROL DE CALIDAD */}
              {activeTab === 'qc' && (
                <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <h4 className="text-[9px] font-black uppercase tracking-wider text-purple-600 flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Detalle de Control de Calidad
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                    {canPrintKaonLabel ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          void handlePrintKaonLabel();
                        }}
                        className="text-[10px] font-black uppercase tracking-wider text-white bg-[#181c3a] hover:bg-slate-800 px-4 py-2 rounded-xl transition-all border border-[#181c3a] shadow-sm hover:shadow active:scale-95 inline-flex items-center gap-1.5"
                        title="Imprimir label del equipo (CG-2200 / CG-3000)"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Imprimir label
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setQcEtiqueta('SI');
                        setQcSello('SI');
                        setQcChecklist('SI');
                        setQcLegible('SI');
                      }}
                      className="text-[10px] font-black uppercase tracking-wider text-purple-600 bg-purple-50 hover:bg-purple-100 px-4 py-2 rounded-xl transition-all border border-purple-200 shadow-sm hover:shadow active:scale-95"
                    >
                      Marcar Todos SÍ
                    </button>
                  </div>
                </div>
                  
                  <div className="grid grid-cols-1 gap-4">
                    {/* Cambio de Etiqueta */}
                    <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 transition-colors hover:border-purple-200">
                      <span className="text-xs font-bold text-slate-700">Cambio de Etiqueta</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcEtiqueta('SI'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcEtiqueta === 'SI' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>SÍ</button>
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcEtiqueta('NO'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcEtiqueta === 'NO' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>NO</button>
                      </div>
                    </div>
                    {/* Sello de Seguridad */}
                    <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 transition-colors hover:border-purple-200">
                      <span className="text-xs font-bold text-slate-700">Sello de Seguridad</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcSello('SI'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcSello === 'SI' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>SÍ</button>
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcSello('NO'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcSello === 'NO' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>NO</button>
                      </div>
                    </div>
                    {/* Check List Funcional */}
                    <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 transition-colors hover:border-purple-200">
                      <span className="text-xs font-bold text-slate-700">Check List</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcChecklist('SI'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcChecklist === 'SI' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>SÍ</button>
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcChecklist('NO'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcChecklist === 'NO' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>NO</button>
                      </div>
                    </div>
                    {/* Datos Legibles */}
                    <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 transition-colors hover:border-purple-200">
                      <span className="text-xs font-bold text-slate-700">Datos Legibles</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcLegible('SI'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcLegible === 'SI' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>SÍ</button>
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcLegible('NO'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcLegible === 'NO' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>NO</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* FORMULARIO DE REACONDICIONADO */}
              {activeTab === 'reacondicionado' && (() => {
                const currentTechName = selectedForOperation?.tecnologia;
                const currentModelName = selectedForOperation?.modelo;

                const currentTech = catTecnologias.find(t => t.name === currentTechName);
                const currentModel = catModelos.find(m => m.name === currentModelName);

                const REACOND_OPTIONS = catReacondicionadoTests
                  .filter(rt => {
                     if (rt.technology_ids?.length > 0 && currentTech && !rt.technology_ids.includes(currentTech.id)) return false;
                     if (rt.model_ids?.length > 0 && currentModel && !rt.model_ids.includes(currentModel.id)) return false;
                     return true;
                  })
                  .map(rt => rt.name);

                return (
                <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 space-y-3">
                  <h4 className="text-[9px] font-black uppercase tracking-wider text-emerald-600 flex items-center gap-2 mb-6">
                    <RefreshCw className="w-4 h-4" />
                    Pruebas de Reacondicionado
                  </h4>
                  
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-2">
                      <select
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-black uppercase text-slate-700 outline-none shadow-sm focus:border-emerald-400"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val && !reacondTests.includes(val)) {
                            setReacondTests([...reacondTests, val]);
                          }
                          e.target.value = ''; // reset
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>SELECCIONAR PRUEBA REALIZADA...</option>
                        {REACOND_OPTIONS.map(item => (
                          <option key={item} value={item} disabled={reacondTests.includes(item)}>
                            {item}
                          </option>
                        ))}
                      </select>
                      <button 
                        onClick={() => setReacondTests(REACOND_OPTIONS)}
                        className="shrink-0 bg-emerald-500 text-white hover:bg-emerald-600 font-black uppercase tracking-widest text-[10px] px-6 rounded-xl transition-all shadow-sm shadow-emerald-500/20 flex items-center justify-center"
                      >
                        Cargar Todas
                      </button>
                    </div>

                    <div className="flex flex-col gap-2">
                      {reacondTests.map(test => (
                        <div key={test} className="flex items-center justify-between border px-4 py-3 rounded-xl shadow-sm bg-emerald-50 border-emerald-200 text-emerald-700">
                          <span className="text-[11px] font-black uppercase tracking-widest">{test}</span>
                          <button 
                            onClick={() => setReacondTests(reacondTests.filter(t => t !== test))} 
                            className="transition-colors text-emerald-500 hover:text-rose-500"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      {reacondTests.length === 0 && (
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">No se han seleccionado pruebas.</p>
                      )}
                    </div>
                  </div>
                </div>
              )})()}

              {/* Observaciones Técnicas */}
              <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 space-y-2">
                <label className="text-[9px] font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                  Observaciones{diagnosticResult === 'l3' ? ' / Motivo L3' : ''}
                </label>
                <textarea 
                  value={diagnosticNotes}
                  onChange={(e) => setDiagnosticNotes(e.target.value)}
                  className="w-full h-20 bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-medium text-slate-700 outline-none focus:border-amber-400 resize-none"
                  placeholder={
                    diagnosticResult === 'l3'
                      ? 'Obligatorio si no hay diagnóstico: indique por qué se envía a L3...'
                      : 'Detalle hallazgos, componentes a cambiar o anomalías detectadas...'
                  }
                />
              </div>
            </div>

            <div className="p-3 border-t border-slate-100 bg-white shrink-0 space-y-3">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <h4 className={`text-[9px] font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 ${activeTab === 'qc' ? 'text-purple-600' : 'text-amber-500'}`}>
                  <Activity className="w-3.5 h-3.5" />
                  Resultado de evaluación
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {(activeTab === 'qc' ? [
                    { label: 'Aceptado → Listo', value: 'listo', variant: 'text-emerald-600 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-50' },
                    { label: 'Rechazado → Técnico', value: 'rechazado_qc', variant: 'text-rose-600 border-rose-500/30 hover:border-rose-500 hover:bg-rose-50' },
                  ] : activeTab === 'reparacion' ? [
                    { label: 'Control Calidad', value: 'control_calidad', variant: 'text-purple-600 border-purple-500/30 hover:border-purple-500 hover:bg-purple-50' },
                    { label: 'Reacondicionado', value: 'reacondicionado', variant: 'text-emerald-600 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-50' },
                    { label: 'L3 Avanzado', value: 'l3', variant: 'text-orange-600 border-orange-500/30 hover:border-orange-500 hover:bg-orange-50' },
                    { label: 'Scraps', value: 'scraps', variant: 'text-rose-600 border-rose-500/30 hover:border-rose-500 hover:bg-rose-50' }
                  ] : activeTab === 'reacondicionado' ? [
                    // Reacondicionado → QC (no saltar a Equipo Listo).
                    { label: 'Control Calidad', value: 'control_calidad', variant: 'text-purple-600 border-purple-500/30 hover:border-purple-500 hover:bg-purple-50' },
                    { label: 'Reparación L1/L2', value: 'reparacion', variant: 'text-blue-600 border-blue-500/30 hover:border-blue-500 hover:bg-blue-50' },
                    { label: 'Reparación L3', value: 'l3', variant: 'text-orange-600 border-orange-500/30 hover:border-orange-500 hover:bg-orange-50' },
                    { label: 'Scraps', value: 'scraps', variant: 'text-rose-600 border-rose-500/30 hover:border-rose-500 hover:bg-rose-50' }
                  ] : activeTab === 'l3' ? [
                    { label: 'Reparaciones', value: 'reparacion', variant: 'text-blue-600 border-blue-500/30 hover:border-blue-500 hover:bg-blue-50' },
                    { label: 'Scraps', value: 'scraps', variant: 'text-rose-600 border-rose-500/30 hover:border-rose-500 hover:bg-rose-50' },
                  ] : [
                    // Diagnóstico inicial
                    { label: 'Reacondicionar', value: 'reacondicionado', variant: 'text-emerald-600 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-50' },
                    { label: 'Reparación L1/L2', value: 'reparacion', variant: 'text-blue-600 border-blue-500/30 hover:border-blue-500 hover:bg-blue-50' },
                    { label: 'Nivel 3', value: 'l3', variant: 'text-orange-600 border-orange-500/30 hover:border-orange-500 hover:bg-orange-50' },
                    { label: 'Scraps', value: 'scraps', variant: 'text-rose-600 border-rose-500/30 hover:border-rose-500 hover:bg-rose-50' },
                  ]).map((res) => (
                    <button 
                      key={res.value} 
                      onClick={() => setDiagnosticResult(res.value)}
                      className={`p-2 rounded-lg border text-center transition-all ${res.variant} ${diagnosticResult === res.value ? 'bg-current/10 border-current shadow-sm' : 'bg-white border-slate-200'}`}
                    >
                      <p className="text-[8px] font-black uppercase leading-tight">{res.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1 h-9 font-black uppercase tracking-wide text-[9px]" 
                onClick={() => {
                  setSelectedForOperation(null);
                  setDiagnosticResult(null);
                  setDiagnosticNotes('');
                  setFunctionalChecks({});
                  setCosmeticClass(null);
                  setLabelStatus(null);
                  setSelectedDiagnostics([]);
                }}
              >
                Cancelar
              </Button>
              <Button 
                variant="primary" 
                className="flex-[2] h-9 font-black uppercase tracking-wide text-[9px] bg-[#181c3a] shadow-md" 
                disabled={
                  loading || 
                  !diagnosticResult || 
                  (activeTab === 'diagnostico' && (!cosmeticClass || !labelStatus || selectedDiagnostics.length === 0)) ||
                  (diagnosticResult === 'l3' &&
                    activeTab !== 'diagnostico' &&
                    !diagnosticNotes.trim() &&
                    lockedDiagnostics.length === 0 &&
                    !(selectedForOperation?.current_diagnostics?.length > 0))
                }
                onClick={handleCompleteOperation}
              >
                {loading ? <Loader2 className="animate-spin w-4 h-4" /> : `Guardar ${activeTab === 'diagnostico' ? 'diagnóstico' : activeTab === 'reparacion' ? 'reparación' : 'operación'}`}
              </Button>
            </div>
            </div>
          </Card>
        </div>
  );
});
