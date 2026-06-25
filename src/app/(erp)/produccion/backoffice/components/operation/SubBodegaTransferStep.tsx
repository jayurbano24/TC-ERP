'use client';

import React from 'react';
import { Button, Card, notify } from '@/components/ui';
import { ChevronDown, ChevronLeft, Package, Radio } from 'lucide-react';
import type { OperationContext } from '../../operation/operationContext';

type Props = { ctx: OperationContext };

export function SubBodegaTransferStep({ ctx }: Props) {
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
      <div className="space-y-8 animate-rise-in max-w-4xl mx-auto">
        <div className="flex justify-between items-center">
          <button onClick={() => setReceptionStep('classification')} className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-[#181c3a] uppercase tracking-widest transition-all">
            <ChevronLeft size={16} /> Volver a Clasificación
          </button>
        </div>
    
        <Card className="p-12 border-none shadow-2xl rounded-[2.5rem] bg-white text-center border border-slate-100">
          <div className={`${category === 'Accesorio' ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500'} w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8`}>
            {category === 'Accesorio' ? <Package size={48} /> : <Radio size={48} />}
          </div>
          <h2 className="text-3xl font-black text-[#181c3a] uppercase mb-4">Transferencia a Sub-Bodega</h2>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mb-12">Confirmar el envío de la caja a la sub-bodega correspondiente</p>
    
          <div className="bg-slate-50 p-8 rounded-3xl text-left mb-12 border border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Destino (Sub-Bodega)</p>
                <p className={`text-xl font-black uppercase ${category === 'Accesorio' ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {category === 'Accesorio' ? 'Bodega de Accesorios' : 'Móviles (Teléfonos)'}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Caja / Guía a Transferir</p>
                <p className="text-xl font-black text-[#181c3a] font-mono">{scannedGuides.join(', ')}</p>
              </div>
            </div>
            <div className="space-y-4 mb-8">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Agencia de Origen (CAC)</label>
              <div className="relative">
                <select 
                  className="w-full p-6 bg-white border border-slate-200 rounded-2xl font-bold text-sm text-[#181c3a] outline-none focus:ring-2 focus:ring-[#2ec4f1] appearance-none transition-all"
                  value={agencia}
                  onChange={(e) => setAgencia(e.target.value)}
                >
                  <option value="">-- Seleccionar Agencia --</option>
                  {CAC_AGENCIES.map((a: any) => (
                    <option key={a.id} value={a.name}>{a.name}</option>
                  ))}
                </select>
                <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <ChevronDown size={18} />
                </div>
              </div>
            </div>
    
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Notas de la Transferencia (Opcional)</label>
              <textarea 
                className="w-full p-6 bg-white border border-slate-200 rounded-2xl font-bold text-sm text-[#181c3a] outline-none focus:ring-2 focus:ring-[#2ec4f1] min-h-[100px] transition-all"
                placeholder="Ej. Cantidad estimada de piezas, estado de la caja..."
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
              />
            </div>
          </div>
    
          <div className="flex gap-4">
            <Button variant="outline" className="flex-1 h-20 rounded-2xl font-black uppercase text-xs" onClick={() => setReceptionStep('classification')}>Cancelar</Button>
             <Button 
              className={`flex-[2] h-20 text-white rounded-2xl shadow-2xl font-black uppercase text-xs transition-all ${(!agencia || isSubmitting) ? 'bg-slate-300 cursor-not-allowed' : (category === 'Accesorio' ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20')}`}
              onClick={async () => {
                if (!agencia || isSubmitting) {
                  if (!agencia) notify.warning("Por favor, seleccione una agencia de origen.");
                  return;
                }
                // Forzamos que la categoría sea la correcta antes de guardar
                await completeCurrentGuides();
              }}
              disabled={!agencia || isSubmitting}
            >
              {isSubmitting ? 'Procesando...' : 'Confirmar Envío a Sub-Bodega'}
            </Button>
          </div>
        </Card>
      </div>
  );
}
