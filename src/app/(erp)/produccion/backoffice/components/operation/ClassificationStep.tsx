'use client';

import React from 'react';
import { Badge, Button } from '@/components/ui';
import { Box, CheckCircle2, ChevronLeft, Monitor, Package, Radio, RefreshCw } from 'lucide-react';
import { parseReceptionGuideList } from '../../operation/parseReceptionGuideList';
import type { OperationContext } from '../../operation/operationContext';

type Props = { ctx: OperationContext };

export function ClassificationStep({ ctx }: Props) {
  const {
    receptionStep, setReceptionStep, activeReception, setActiveReception,
    accessoryPhotos, setAccessoryPhotos, scannedGuides, setScannedGuides,
    processedGuides, setProcessedGuides, inboxSearch, setInboxSearch,
    classificationSearch, setClassificationSearch, agencia, setAgencia,
    selectedAgencyId, setSelectedAgencyId, category, setCategory,
    guideItems, setGuideItems, manifestPanelOpen, setManifestPanelOpen,
    returnReason, setReturnReason, returnTracking, setReturnTracking,
    returnCourier, setReturnCourier, sapTransferNumber, setSapTransferNumber,
    sapGroups, setSapGroups, activeSapGroupId, setActiveSapGroupId,
    newItem, setNewItem, selectedItemIdx, setSelectedItemIdx,
    itemSeriesInputs, setItemSeriesInputs, pendingReceptions, loading,
    inboxLoadError, isSubmitting, processingDateLabel, currentUserFullName,
    allReceptions, historyLoading, CAC_AGENCIES, MASTER_TECNOLOGIAS,
    MASTER_MARCAS, MASTER_MODELOS, agencyDetails, availableBrandsConfig,
    availableModels, isActiveSapDocumentFilled, startProcessingReception,
    handlePrintConduce, fetchPending, fetchHistory, handleTestConnection,
    initSapGroupsForConfig, handleUndoClassification, setShowAgencyModal,
    addSapGroup, selectSapGroup, removeSapGroup, updateActiveSapDocument,
    addItem, completeCurrentGuides, handleConfirmReturn, compressImage,
    setShowBulkModal, setBulkTargetIdx, onCompletedNextBox,
  } = ctx;

  return (
      <div className="space-y-8 animate-rise-in">
        <div className="flex justify-between items-center">
          <button onClick={() => { setReceptionStep('category_selection'); setClassificationSearch(''); }} className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-[#181c3a] uppercase tracking-widest transition-all">
            <ChevronLeft size={16} /> Volver a Bandeja
          </button>
          <div className="text-right">
            <Badge className="bg-[#2ec4f1] text-[#181c3a] border-none font-black text-[9px] uppercase tracking-widest">{activeReception.status}</Badge>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Lote: {activeReception.guide_number?.split(' ')[0]}</p>
          </div>
        </div>
        <div className="bg-white p-12 rounded-[2.5rem] shadow-2xl border border-slate-100 text-center">
          <h2 className="text-3xl font-black text-[#181c3a] uppercase mb-2 leading-none">Clasificación de Carga</h2>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mb-12">Seleccione una caja para iniciar su procesamiento</p>
          <div className="grid grid-cols-1 gap-4 max-w-7xl mx-auto">
            {(() => {
              const rawNotes = activeReception.notes || '';
              const cleanNotes = rawNotes
                .split('---')[0]
                .split('Backoffice_')[0]
                .split('Guías Procesadas:')[0];
                
              const rawGuideNumber = activeReception.guide_number || '';
              const fallbackGuides = rawGuideNumber.split(/[\\/,]/).map(g => g.trim()).filter(Boolean);
              const guiasListString = cleanNotes?.split('Guías: ')[1]?.split('\n')[0];
              const guiasList = guiasListString 
                ? guiasListString.split(/[\\/,]/).map((g: string) => g.trim()).filter(Boolean) 
                : (fallbackGuides.length > 0 ? fallbackGuides : [rawGuideNumber]);
                
              const pendingCount = guiasList.filter((g: string) => !processedGuides.includes(g)).length;
    
              return (
                <>
                  <div className="flex justify-between items-center mb-2 px-2">
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
                      Estado del Lote
                    </p>
                    <Badge className="bg-slate-50 text-[#181c3a] font-black text-xs px-4 py-2 border border-slate-200">
                      {pendingCount} DE {guiasList.length} PENDIENTES
                    </Badge>
                  </div>
                  {/* BUSCADOR DE GUÍAS */}
                  <div className="relative mb-6">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Buscar número de guía..."
                      value={classificationSearch}
                      onChange={(e) => setClassificationSearch(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all placeholder:text-slate-300"
                    />
                    {classificationSearch && (
                      <button
                        onClick={() => setClassificationSearch('')}
                        className="absolute inset-y-0 right-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {guiasList.map((guia: string, idx: number) => {
                    // Filtrar por búsqueda
                    if (classificationSearch && !guia.toLowerCase().includes(classificationSearch.toLowerCase())) return null;
                    const isProcessedLocally = processedGuides.includes(guia);
                    // Detección Global: Buscar si la guía ya existe en cualquier recepción terminada
                    const isProcessedGlobally = allReceptions.some(r => 
                      r.status === 'RECIBIDO_BACKOFFICE' && 
                      (r.guide_number === guia || r.notes?.toLowerCase().includes(guia.toLowerCase()))
                    );
                    const isProcessed = isProcessedLocally || isProcessedGlobally;
    
                    if (isProcessed) return null;
    
                    return (
                      <div key={idx} className={`bg-slate-50 p-8 rounded-3xl border-2 flex flex-col md:flex-row items-center justify-between transition-all shadow-sm border-slate-100 hover:border-[#2ec4f1]/30 hover:shadow-xl group`}>
                        <div className="flex items-center gap-6 mb-6 md:mb-0">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm transition-all ${isProcessed ? (isProcessedGlobally ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600') : 'bg-white text-[#181c3a] group-hover:bg-[#181c3a] group-hover:text-white'}`}>
                            {isProcessed ? <CheckCircle2 size={24} /> : <Box size={24} />}
                          </div>
                          <div className="text-left">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              No. de Guía / Caja 
                              {isProcessedLocally && <span className="text-emerald-500 ml-2 font-black">— Procesada Ahora</span>}
                              {!isProcessedLocally && isProcessedGlobally && <span className="text-blue-500 ml-2 font-black">— YA PROCESADA EN HISTORIAL</span>}
                            </p>
                            <h4 className={`text-xl font-black font-mono ${isProcessed ? 'text-slate-400' : 'text-[#181c3a]'}`}>{guia}</h4>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 justify-center md:justify-end">
                          {isProcessed ? (
                            <div className="flex flex-col items-center gap-2 md:flex-row">
                              <Badge className="bg-emerald-50 text-emerald-600 font-black text-[10px] px-6 py-4 rounded-xl border-none uppercase tracking-widest">
                                Caja Recibida Completamente
                              </Badge>
                              <Button 
                                onClick={() => handleUndoClassification(guia)} 
                                disabled={loading}
                                className="bg-slate-200 hover:bg-slate-300 text-slate-600 border-none rounded-xl px-4 py-4 font-black text-[10px] uppercase tracking-[0.1em] transition-all flex items-center justify-center"
                              >
                                <RefreshCw size={14} className="mr-2" /> Reclasificar
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Button onClick={() => { setCategory('Equipo'); setScannedGuides([guia]); initSapGroupsForConfig(); setReceptionStep('config'); }} className="bg-[#181c3a] hover:bg-[#2ec4f1] text-white border-none rounded-2xl px-8 py-6 font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg group">
                                <Monitor size={18} className="mr-3 group-hover:scale-110 transition-transform" /> Equipos
                              </Button>
                              <Button 
                                onClick={() => { 
                                  setCategory('Accesorio'); 
                                  setScannedGuides([guia]); 
                                  setAgencia(''); 
                                  setSelectedAgencyId('');
                                  setReceptionStep('accessories_photos' as any); 
                                }} 
                                className="bg-emerald-500 hover:bg-emerald-600 text-white border-none rounded-2xl px-8 py-6 font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg flex items-center justify-center group"
                              >
                                <Package size={18} className="mr-3 group-hover:scale-110 transition-transform" /> Accesorios
                              </Button>
                              <Button onClick={() => { setCategory('Teléfono'); setScannedGuides([guia]); setAgencia(''); setSelectedAgencyId(''); setReceptionStep('sub_bodega_transfer'); }} className="bg-amber-500 hover:bg-amber-600 text-white border-none rounded-2xl px-8 py-6 font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg group">
                                <Radio size={18} className="mr-3 group-hover:scale-110 transition-transform" /> Teléfonos
                              </Button>
                              <Button onClick={() => { setCategory('Devolución' as any); setScannedGuides([guia]); setAgencia(''); setSelectedAgencyId(''); setReceptionStep('return_confirmation' as any); }} className="bg-rose-500 hover:bg-rose-600 text-white border-none rounded-2xl px-8 py-6 font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg flex items-center justify-center group">
                                <RefreshCw size={18} className="mr-3 group-hover:scale-110 transition-transform" /> Devoluciones
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
        </div>
      </div>
  );
}
