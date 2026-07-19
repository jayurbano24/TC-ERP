'use client';

import React from 'react';
import { Badge, Button, Card } from '@/components/ui';
import { Barcode, ChevronLeft, Hash, Package, Trash2 } from 'lucide-react';
import type { OperationContext } from '../../operation/operationContext';
import { ConfigSeriesScanPanel } from './ConfigSeriesScanPanel';

type Props = { ctx: OperationContext };

export function ConfigEquipmentPanel({ ctx }: Props) {
  const {
    manifestPanelOpen,
    setManifestPanelOpen,
    guideItems,
    setGuideItems,
    sapGroups,
    selectedItemIdx,
    setSelectedItemIdx,
    MASTER_TECNOLOGIAS,
    MASTER_MARCAS,
    MASTER_MODELOS,
    category,
    isSubmitting,
    setReceptionStep,
    completeCurrentGuides,
  } = ctx;

  return (
    <Card className={`${manifestPanelOpen ? 'xl:col-span-8' : 'xl:col-span-12'} p-8 xl:p-10 border-none shadow-2xl rounded-[2.5rem] bg-white min-h-[500px] flex flex-col order-1 transition-all`}>
            <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[var(--accent)] text-[var(--heading)] rounded-xl flex items-center justify-center font-black text-xs">2</div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Listado de Equipos del Conduce</h3>
              </div>
              <div className="flex items-center gap-2">
                {!manifestPanelOpen && (
                  <button
                    type="button"
                    onClick={() => setManifestPanelOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--heading)] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[var(--accent)] hover:text-[var(--heading)] transition-all"
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
                      <tr className="bg-[var(--heading)] border-b border-[var(--heading)]">
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
                              <span className="text-[10px] font-black text-[var(--heading)] uppercase">{techName}</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-[10px] font-black text-[var(--heading)] uppercase">{marcaName}</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-xs font-black text-[var(--heading)]">{modeloName}</span>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <span className="font-black text-sm text-[var(--heading)]">{item.cantidad}</span>
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
                                  className={`p-2 rounded-lg transition-all ${isSelected ? 'bg-[var(--accent)] text-white' : 'text-slate-300 hover:text-[var(--accent)] hover:bg-blue-50'}`}
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
          
      <ConfigSeriesScanPanel ctx={ctx} />
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
                    className={`w-full h-20 rounded-[1.5rem] shadow-2xl font-black uppercase tracking-[0.2em] text-xs transition-all ${(!isReady || isSubmitting) ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : (isAccesorio ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-[var(--heading)] hover:bg-[var(--accent)] text-white')}`} 
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
  );
}
