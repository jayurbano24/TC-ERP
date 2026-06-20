'use client';

import React from 'react';
import { Badge, Button, Card } from '@/components/ui';
import {
  Barcode, Calendar, ChevronLeft, ChevronRight, Edit3, Hash, MapPin, Package, Phone, Plus, Table, Trash2, Truck, UserCheck, X,
} from 'lucide-react';
import { summarizeSapGroupGuideItems } from '../../backofficeHelpers';
import type { OperationContext } from '../../operation/operationContext';

type Props = { ctx: OperationContext };

export function ConfigStep({ ctx }: Props) {
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

  if (!activeReception) return null;

  return (
      <div className="space-y-6 animate-rise-in max-w-none mx-auto pb-20">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <button onClick={() => setReceptionStep('classification')} className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-[#181c3a] uppercase tracking-widest transition-all">
              <ChevronLeft size={16} /> Volver al Triaje
            </button>
            <div className="h-6 w-[2px] bg-slate-100 mx-2"></div>
            <h2 className="text-2xl font-black text-[#181c3a] uppercase tracking-tighter">Procesando Guía: <span className="text-[#2ec4f1] ml-2">{scannedGuides.map(g => g.split(' ')[0]).join(' / ') || activeReception.guide_number?.split(' ')[0]}</span></h2>
          </div>
          <div className="flex gap-2">
             <Badge className="bg-[#181c3a] text-white px-6 py-2 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border-none shadow-lg">Lote ID: {activeReception.id.substring(0,8)}</Badge>
          </div>
        </div>
    
        {/* PANEL DE INFORMACIÓN DE AGENCIA (HEADER) - REDISEÑADO PARA METADATOS DINÁMICOS */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-2xl grid grid-cols-1 md:grid-cols-3 gap-10 mb-8 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#2ec4f1] to-[#181c3a]"></div>
          
          <button 
            onClick={() => setShowAgencyModal(true)}
            className="flex items-start gap-6 border-r border-slate-50 pr-6 text-left hover:bg-slate-50/50 transition-all rounded-[2rem] p-4 -m-4 group/btn"
          >
            <div className="bg-slate-50 p-5 rounded-2xl text-[#181c3a] shadow-inner group-hover/btn:bg-[#181c3a] group-hover/btn:text-white transition-all"><Truck size={28} /></div>
            <div className="flex-1 overflow-hidden">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Tienda / Agencia Destino</p>
              <h3 className="text-xl font-black text-[#181c3a] uppercase truncate leading-tight group-hover/btn:text-[#2ec4f1] transition-colors">{agencyDetails?.name || 'SELECCIONAR AGENCIA'}</h3>
              <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase flex items-center gap-2">
                <MapPin size={12} className="text-[#2ec4f1]" /> {agencyDetails?.direccion || 'SIN DIRECCIÓN REGISTRADA'}
              </p>
            </div>
          </button>
    
          <div className="flex items-start gap-6 border-r border-slate-50 pr-6">
            <div className="bg-blue-50 p-5 rounded-2xl text-[#2ec4f1] shadow-inner"><UserCheck size={28} /></div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Encargado de Tienda</p>
              <h3 className="text-xl font-black text-[#181c3a] uppercase leading-tight">{agencyDetails?.manager || 'PENDIENTE'}</h3>
              <p className="text-[10px] font-bold text-slate-400 mt-2 flex items-center gap-2">
                <Phone size={12} className="text-[#2ec4f1]" /> {(agencyDetails as any)?.telefono || 'SIN TELÉFONO'}
              </p>
            </div>
          </div>
    
          <div className="flex items-start gap-6">
            <div className="bg-emerald-50 p-5 rounded-2xl text-emerald-500 shadow-inner"><Calendar size={28} /></div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Fecha de Procesamiento</p>
              <h3 className="text-xl font-black text-[#181c3a] uppercase leading-tight">{processingDateLabel || '---'}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">Usuario: {activeReception.received_by || 'SISTEMA'}</p>
            </div>
          </div>
        </div>
    
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start relative">
          {/* SECCIÓN 2: LISTADO — prioridad izquierda, más ancho */}
          <Card className={`${manifestPanelOpen ? 'xl:col-span-8' : 'xl:col-span-12'} p-8 xl:p-10 border-none shadow-2xl rounded-[2.5rem] bg-white min-h-[500px] flex flex-col order-1 transition-all`}>
            <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#2ec4f1] text-[#181c3a] rounded-xl flex items-center justify-center font-black text-xs">2</div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Listado de Equipos del Conduce</h3>
              </div>
              <div className="flex items-center gap-2">
                {!manifestPanelOpen && (
                  <button
                    type="button"
                    onClick={() => setManifestPanelOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#181c3a] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#2ec4f1] hover:text-[#181c3a] transition-all"
                  >
                    <ChevronLeft size={14} /> Manifiesto
                  </button>
                )}
                <Badge className="bg-slate-50 text-slate-400 border-none font-black text-[9px] px-4 py-1.5 uppercase tracking-widest">{guideItems.length} ÍTEM(S)</Badge>
              </div>
            </div>
    
            {/* TABLA DE EQUIPOS */}
            {guideItems.length > 0 ? (
              <div className="space-y-8">
                {sapGroups.filter((g) => guideItems.some((i) => i.sapGroupId === g.id)).map((sapGroup) => {
                  const groupItems = guideItems
                    .map((item, idx) => ({ item, idx }))
                    .filter(({ item }) => item.sapGroupId === sapGroup.id);
                  if (groupItems.length === 0) return null;
                  return (
                    <div key={sapGroup.id} className="space-y-3">
                      <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 rounded-2xl border border-amber-100">
                        <Hash size={14} className="text-amber-600" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">
                          Documento SAP: {sapGroup.sapDocument || '---'}
                        </span>
                        <Badge className="bg-white text-amber-600 border-none text-[8px] font-black ml-auto">
                          {groupItems.length} ítem(s)
                        </Badge>
                      </div>
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[#181c3a] border-b border-[#181c3a]">
                        <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90">Tecnología</th>
                        <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90">Marca</th>
                        <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90">Modelo</th>
                        <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90 text-center">Cantidad</th>
                        <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90 text-center">Recibido</th>
                        <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90 text-center">Pendiente</th>
                        <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90 text-center">Series</th>
                        <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {groupItems.map(({ item, idx }) => {
                        const techName = MASTER_TECNOLOGIAS.find(t => t.id === item.tipo)?.nombre || item.tipo;
                        const marcaName = MASTER_MARCAS.find(m => m.id === item.marca)?.nombre || item.marca;
                        const modeloName = MASTER_MODELOS.find(m => m.id === item.modelo)?.nombre || item.modelo;
                        const completedUnits = item.series.filter(u => u.length >= item.seriesPerUnit).length;
                        const pendingUnits = item.cantidad - completedUnits;
                        const totalSeries = item.series.flat().length;
                        const expectedSeries = item.cantidad * item.seriesPerUnit;
                        const isSelected = selectedItemIdx === idx;
                        const isComplete = completedUnits >= item.cantidad;
    
                        return (
                          <tr 
                            key={idx} 
                            className={`transition-all cursor-pointer ${isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'} ${isComplete ? 'opacity-60' : ''}`}
                            onClick={() => setSelectedItemIdx(isSelected ? null : idx)}
                          >
                            <td className="px-5 py-4">
                              <span className="text-[10px] font-black text-[#181c3a] uppercase">{techName}</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-[10px] font-black text-[#181c3a] uppercase">{marcaName}</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-xs font-black text-[#181c3a]">{modeloName}</span>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <span className="font-black text-sm text-[#181c3a]">{item.cantidad}</span>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <Badge className={`border-none font-black text-[10px] ${completedUnits > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                                {completedUnits}
                              </Badge>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <Badge className={`border-none font-black text-[10px] ${pendingUnits > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                {pendingUnits}
                              </Badge>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <span className={`text-[10px] font-mono font-black ${totalSeries >= expectedSeries ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {totalSeries}/{expectedSeries}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-1">
                                <button 
                                  onClick={() => setSelectedItemIdx(isSelected ? null : idx)} 
                                  className={`p-2 rounded-lg transition-all ${isSelected ? 'bg-[#2ec4f1] text-white' : 'text-slate-300 hover:text-[#2ec4f1] hover:bg-blue-50'}`}
                                  title="Pistolear series"
                                >
                                  <Barcode size={16} />
                                </button>
                                <button 
                                  onClick={() => { setSelectedItemIdx(null); setGuideItems(guideItems.filter((_, i) => i !== idx)); }} 
                                  className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                    </div>
                  );
                })}
    
                {/* ZONA DE PISTOLEO (aparece al seleccionar un item) */}
                {selectedItemIdx !== null && guideItems[selectedItemIdx] && (() => {
                  const item = guideItems[selectedItemIdx];
                  const idx = selectedItemIdx;
                  const techName = MASTER_TECNOLOGIAS.find(t => t.id === item.tipo)?.nombre || '';
                  const marcaName = MASTER_MARCAS.find(m => m.id === item.marca)?.nombre || '';
                  const modeloName = MASTER_MODELOS.find(m => m.id === item.modelo)?.nombre || '';
                  const totalSeries = item.series.flat().length;
                  const expectedSeries = item.cantidad * item.seriesPerUnit;
    
                  return (
                    <div className="bg-slate-50 rounded-[2rem] p-8 border-2 border-[#2ec4f1]/20 animate-rise-in">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div>
                          <p className="text-[9px] font-black text-[#2ec4f1] uppercase tracking-widest mb-1">{techName} • {marcaName}</p>
                          <h4 className="text-lg font-black text-[#181c3a] uppercase">{modeloName}</h4>
                          <p className="text-[9px] font-black text-slate-400 uppercase mt-1">
                            {item.seriesPerUnit} series/unidad — <span className="text-emerald-500">{totalSeries}/{expectedSeries} series totales</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Botón eliminado para evitar cierres accidentales */}
                          {/* 
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={async () => {
                              if (confirm("¿Marcar lote completo como recibido? Esto lo moverá al historial.")) {
                                                            fetchPending();
                                setActiveReception(null);
                              }
                            }}
                            className="border-slate-200 text-[8px] font-black uppercase text-slate-400 hover:bg-emerald-50 hover:text-emerald-500 hover:border-emerald-100"
                            leftIcon={<CheckCircle2 size={12} />}
                          >
                            Marcar Recibido
                          </Button> 
                          */}
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => { setBulkTargetIdx(idx); setShowBulkModal(true); }}
                            className="border-slate-200 text-[9px] font-black uppercase text-[#2ec4f1] hover:bg-blue-50"
                          >
                            <Table size={12} className="mr-1.5" /> Carga Masiva
                          </Button>
                          <div className="flex gap-2">
                            <input 
                              type="text"
                              autoFocus
                              placeholder={`Pistolear ${item.series.length > 0 && item.series[item.series.length - 1].length < item.seriesPerUnit ? 'Serie ' + (item.series[item.series.length - 1].length + 1) + ' / Unidad ' + item.series.length : 'Serie 1 / Unidad ' + (item.series.length + 1)}...`}
                              className="bg-white border-2 border-slate-200 rounded-xl px-4 py-3 text-xs font-mono font-bold outline-none focus:border-[#2ec4f1] w-64 transition-all"
                              value={itemSeriesInputs[idx] || ''}
                              onChange={(e) => setItemSeriesInputs({...itemSeriesInputs, [idx]: e.target.value})}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const sn = itemSeriesInputs[idx]?.trim().toUpperCase();
                                  if (sn) {
                                    const newItems = [...guideItems];
                                    const target = { ...newItems[idx] };
                                    
                                    if (target.series.flat().includes(sn)) {
                                      alert("Serie ya existe");
                                      return;
                                    }
    
                                    let lastUnit = target.series.length > 0 ? target.series[target.series.length - 1] : null;
                                    
                                    if (lastUnit && lastUnit.length < target.seriesPerUnit) {
                                      lastUnit.push(sn);
                                    } else {
                                      if (target.series.length >= target.cantidad) {
                                        alert("Límite de unidades alcanzado");
                                        return;
                                      }
                                      target.series.push([sn]);
                                    }
                                    
                                    target.scannedCount = target.series.length;
                                    newItems[idx] = target;
                                    setGuideItems(newItems);
                                    setItemSeriesInputs({...itemSeriesInputs, [idx]: ''});
                                  }
                                }
                              }}
                            />
                            <Button 
                              variant="secondary" 
                              className="h-12 w-12 p-0 rounded-xl bg-[#181c3a] text-white hover:bg-[#2ec4f1]"
                              onClick={() => {
                                const sn = itemSeriesInputs[idx]?.trim().toUpperCase();
                                if (!sn) return;
                                const newItems = [...guideItems];
                                const target = { ...newItems[idx] };
                                if (target.series.flat().includes(sn)) { alert("Serie ya existe"); return; }
                                let lastUnit = target.series.length > 0 ? target.series[target.series.length - 1] : null;
                                if (lastUnit && lastUnit.length < target.seriesPerUnit) { lastUnit.push(sn); }
                                else {
                                  if (target.series.length >= target.cantidad) { alert("Límite de unidades alcanzado"); return; }
                                  target.series.push([sn]);
                                }
                                target.scannedCount = target.series.length;
                                newItems[idx] = target;
                                setGuideItems(newItems);
                                setItemSeriesInputs({...itemSeriesInputs, [idx]: ''});
                              }}
                            >
                              <Plus size={16} />
                            </Button>
                          </div>
                        </div>
                      </div>
    
                      {/* Tabla de unidades escaneadas — series en fila S1…S4 */}
                      {item.series.length > 0 ? (
                        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                          <table className="w-full text-left min-w-[640px]">
                            <thead>
                              <tr className="bg-[#181c3a] text-white">
                                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest whitespace-nowrap">Unidad</th>
                                {Array.from({ length: item.seriesPerUnit }, (_, i) => (
                                  <th key={i} className="px-4 py-3 text-[9px] font-black uppercase tracking-widest whitespace-nowrap">
                                    S{i + 1}
                                  </th>
                                ))}
                                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest whitespace-nowrap text-center">Estado</th>
                                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest whitespace-nowrap text-right">Acción</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {item.series.map((unit, uIdx) => {
                                const isComplete = unit.length >= item.seriesPerUnit;
                                return (
                                  <tr
                                    key={uIdx}
                                    className={`group/unit transition-colors hover:bg-slate-50/80 ${isComplete ? '' : 'bg-amber-50/30'}`}
                                  >
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <span className="text-[10px] font-black text-[#181c3a] uppercase">Unidad {uIdx + 1}</span>
                                    </td>
                                    {Array.from({ length: item.seriesPerUnit }, (_, sIdx) => {
                                      const sn = unit[sIdx];
                                      return (
                                        <td key={sIdx} className="px-4 py-3 whitespace-nowrap">
                                          {sn ? (
                                            <div className="flex items-center gap-2 group/sn">
                                              <span className="text-[8px] font-black text-slate-400 shrink-0">S{sIdx + 1}-</span>
                                              <span className="text-[10px] font-mono font-bold text-[#181c3a] max-w-[140px] truncate" title={sn}>
                                                {sn}
                                              </span>
                                              <div className="flex items-center gap-0.5 opacity-0 group-hover/sn:opacity-100 transition-all shrink-0">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const currentSN = unit[sIdx];
                                                    const newSN = prompt('Editar número de serie:', currentSN);
                                                    if (newSN !== null && newSN.trim() !== '') {
                                                      const newItems = [...guideItems];
                                                      newItems[idx].series[uIdx][sIdx] = newSN.trim().toUpperCase();
                                                      setGuideItems(newItems);
                                                    }
                                                  }}
                                                  className="p-1 text-slate-400 hover:text-[#2ec4f1]"
                                                  title="Editar serie"
                                                >
                                                  <Edit3 size={10} />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    if (confirm('¿Eliminar esta serie?')) {
                                                      const newItems = [...guideItems];
                                                      newItems[idx].series[uIdx].splice(sIdx, 1);
                                                      if (newItems[idx].series[uIdx].length === 0) {
                                                        newItems[idx].series.splice(uIdx, 1);
                                                      }
                                                      newItems[idx].scannedCount = newItems[idx].series.length;
                                                      setGuideItems(newItems);
                                                    }
                                                  }}
                                                  className="p-1 text-slate-400 hover:text-rose-500"
                                                  title="Eliminar serie"
                                                >
                                                  <X size={10} />
                                                </button>
                                              </div>
                                            </div>
                                          ) : (
                                            <span className="text-[9px] font-bold text-slate-300 uppercase">S{sIdx + 1}- —</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td className="px-4 py-3 text-center whitespace-nowrap">
                                      {isComplete ? (
                                        <span className="text-[8px] font-black uppercase text-emerald-600 tracking-widest">✓ Completa</span>
                                      ) : (
                                        <span className="text-[8px] font-black uppercase text-amber-600 tracking-widest">
                                          {unit.length}/{item.seriesPerUnit}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newItems = [...guideItems];
                                          newItems[idx].series.splice(uIdx, 1);
                                          newItems[idx].scannedCount = newItems[idx].series.length;
                                          setGuideItems(newItems);
                                        }}
                                        className="p-1.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover/unit:opacity-100 transition-all"
                                        title="Eliminar unidad"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-[10px] italic text-slate-300 text-center py-6">Escanee la primera serie para comenzar...</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center py-20 text-center opacity-20">
                <Package size={64} className="mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">El manifiesto está vacío</p>
              </div>
            )}
    
    
            <div className="pt-8 border-t border-slate-100">
              {(() => {
                const isAllItemsComplete = guideItems.length > 0 && guideItems.every(item => {
                  const completedUnits = item.series.filter(u => u.length >= item.seriesPerUnit).length;
                  return completedUnits >= item.cantidad;
                });
    
                const isAccesorio = category === 'Accesorio';
                const isReady = isAllItemsComplete || isAccesorio;
    
                return (
                  <Button 
                    variant="primary" 
                    className={`w-full h-20 rounded-[1.5rem] shadow-2xl font-black uppercase tracking-[0.2em] text-xs transition-all ${(!isReady || isSubmitting) ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : (isAccesorio ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-[#181c3a] hover:bg-[#2ec4f1] text-white')}`} 
                    onClick={async () => {
                      if (!isReady || isSubmitting) return;
                      if (isAccesorio) {
                        setReceptionStep('return_confirmation');
                      } else {
                        await completeCurrentGuides();
                      }
                    }} 
                    disabled={!isReady || guideItems.length === 0 || isSubmitting}
                  >
                    {isSubmitting ? 'Procesando...' : (isAccesorio ? 'Finalizar y Notificar' : (isAllItemsComplete ? 'Finalizar Recepción' : 'Complete el Pistoleo de Series'))}
                  </Button>
                );
              })()}
            </div>
          </Card>
    
          {/* SECCIÓN 1: MANIFIESTO — panel derecho compacto y colapsable */}
          {manifestPanelOpen && (
            <Card className="xl:col-span-4 p-5 border-none shadow-2xl rounded-[2rem] bg-white sticky top-8 order-2 max-h-[calc(100vh-6rem)] overflow-y-auto">
              <div className="flex items-center justify-between gap-2 mb-4 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 bg-[#181c3a] text-white rounded-lg flex items-center justify-center font-black text-[10px] shrink-0">1</div>
                  <h3 className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 truncate">Definición de Manifiesto</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setManifestPanelOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#181c3a] hover:bg-slate-100 shrink-0"
                  title="Ocultar panel"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
    
              <div className={`space-y-3 transition-all ${!agencyDetails ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[8px] font-black uppercase text-slate-400">Documentos SAP</label>
                  <button
                    type="button"
                    onClick={addSapGroup}
                    disabled={!agencyDetails}
                    className="flex items-center gap-1 px-2 py-1 bg-[#2ec4f1] text-[#181c3a] rounded-lg text-[7px] font-black uppercase hover:bg-[#181c3a] hover:text-white transition-all disabled:opacity-40"
                  >
                    <Plus size={10} /> Nuevo
                  </button>
                </div>
    
                <div className="flex flex-wrap gap-1.5">
                  {sapGroups.map((g, gi) => {
                    const isActive = activeSapGroupId === g.id;
                    const docLabel = g.sapDocument.trim() || `Doc. ${gi + 1}`;
                    return (
                      <div
                        key={g.id}
                        className={`inline-flex items-center gap-0.5 rounded-lg border pl-2 pr-0.5 py-1 ${
                          isActive ? 'border-[#181c3a] bg-[#181c3a] text-white' : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        <button type="button" onClick={() => selectSapGroup(g.id)} className="text-[8px] font-black uppercase max-w-[90px] truncate">
                          {docLabel}
                        </button>
                        {sapGroups.length > 1 && (
                          <button type="button" onClick={() => removeSapGroup(g.id)} className={`p-0.5 rounded ${isActive ? 'text-white/70' : 'text-slate-400 hover:text-rose-500'}`}>
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
    
                <div>
                  <label className="text-[8px] font-black uppercase text-slate-400 mb-1 block">No. Documento SAP</label>
                  <input
                    type="text"
                    className={`w-full px-3 py-2.5 bg-white border rounded-xl font-black text-[10px] text-[#181c3a] outline-none focus:border-[#2ec4f1] ${
                      isActiveSapDocumentFilled ? 'border-slate-200' : 'border-amber-300'
                    }`}
                    value={sapTransferNumber}
                    onChange={(e) => updateActiveSapDocument(e.target.value)}
                    placeholder="SAP-0001... (requerido)"
                    disabled={!agencyDetails || !activeSapGroupId}
                    required
                  />
                  {!isActiveSapDocumentFilled && agencyDetails && (
                    <p className="text-[7px] font-bold uppercase tracking-widest text-amber-600 mt-1">
                      Obligatorio para habilitar Agregar
                    </p>
                  )}
                </div>
    
                {activeSapGroupId && (() => {
                  const summary = summarizeSapGroupGuideItems(activeSapGroupId, guideItems, MASTER_TECNOLOGIAS);
                  if (summary.itemCount === 0) return null;
                  return (
                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[7px] font-black uppercase tracking-widest text-slate-500 space-y-0.5">
                      {summary.techLines.map((line) => (
                        <div key={line.name} className="flex justify-between">
                          <span>{line.name}</span><span>{line.units} eq.</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-[#181c3a] pt-1 border-t border-slate-200">
                        <span>Total</span><span>{summary.totalUnits} eq.</span>
                      </div>
                    </div>
                  );
                })()}
    
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="col-span-2">
                    <label className="text-[8px] font-black uppercase text-slate-400 mb-1 block">Tecnología</label>
                    <select
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-[10px] text-[#181c3a] outline-none focus:border-[#2ec4f1] disabled:opacity-50"
                      value={newItem.tipo}
                      onChange={(e) => setNewItem({ ...newItem, tipo: e.target.value, modelo: '' })}
                      disabled={!agencyDetails}
                    >
                      <option value="">Tecnología...</option>
                      {MASTER_TECNOLOGIAS.map((t) => (
                        <option key={t.id} value={t.id}>{t.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[8px] font-black uppercase text-slate-400 mb-1 block">Marca</label>
                    <select
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-[10px] text-[#181c3a] outline-none focus:border-[#2ec4f1] disabled:opacity-50"
                      value={newItem.marca}
                      onChange={(e) => setNewItem({ ...newItem, marca: e.target.value, modelo: '' })}
                      disabled={!agencyDetails}
                    >
                      <option value="">Marca...</option>
                      {availableBrandsConfig.map((m) => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[8px] font-black uppercase text-slate-400 mb-1 block">Modelo</label>
                    <select
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-[10px] text-[#181c3a] outline-none focus:border-[#2ec4f1] disabled:opacity-50"
                      value={newItem.modelo}
                      onChange={(e) => setNewItem({ ...newItem, modelo: e.target.value })}
                      disabled={!agencyDetails || !newItem.marca || !newItem.tipo}
                    >
                      <option value="">{newItem.marca ? 'Modelo...' : 'Marca primero'}</option>
                      {availableModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[8px] font-black uppercase text-slate-400 mb-1 block">Cant.</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-[10px] text-[#181c3a] outline-none focus:border-[#2ec4f1] disabled:opacity-50"
                      value={newItem.cantidad || ''}
                      onChange={(e) => setNewItem({ ...newItem, cantidad: parseInt(e.target.value) || 0 })}
                      placeholder="0"
                      disabled={!agencyDetails}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={addItem}
                      disabled={!agencyDetails || !isActiveSapDocumentFilled}
                      className={`w-full h-10 rounded-xl font-black uppercase text-[8px] gap-1 ${
                        !agencyDetails || !isActiveSapDocumentFilled
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-[#181c3a] hover:bg-[#2ec4f1] text-white'
                      }`}
                      title={!isActiveSapDocumentFilled ? 'Ingrese el No. Documento SAP primero' : undefined}
                    >
                      <Plus size={14} /> Agregar
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
  );
}
