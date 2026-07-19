'use client';

import React from 'react';
import { Button, Card } from '@/components/ui';
import { Camera, ChevronLeft, Plus, X } from 'lucide-react';
import type { OperationContext } from '../../operation/operationContext';

type Props = { ctx: OperationContext };

export function AccessoryPhotosStep({ ctx }: Props) {
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
          <button onClick={() => setReceptionStep('classification')} className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-[var(--heading)] uppercase tracking-widest transition-all">
            <ChevronLeft size={16} /> Volver a Clasificación
          </button>
        </div>
    
        <Card className="p-12 border-none shadow-2xl rounded-[3rem] bg-white text-center">
          <div className="bg-emerald-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 text-emerald-500">
            <Camera size={48} />
          </div>
          <h2 className="text-3xl font-black text-[var(--heading)] uppercase mb-4">Inspección Visual (Fotos)</h2>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mb-12">Capture evidencia del estado de la caja de accesorios</p>
    
          <div className="bg-slate-50 p-10 rounded-[2.5rem] border-2 border-dashed border-slate-200 mb-10 group hover:border-[var(--accent)] transition-all">
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-slate-300 mb-4 shadow-sm group-hover:text-[var(--accent)] group-hover:scale-110 transition-all">
                <Plus size={32} />
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Subir fotos de la mercadería</p>
              <p className="text-[10px] font-bold text-slate-300 uppercase">JPEG, PNG hasta 10MB</p>
              
              {/* Simulación de carga para demo */}
              <input 
                type="file" 
                multiple 
                className="hidden" 
                id="photo-upload" 
                onChange={(e) => {
                  // Aquí iría la lógica de carga a Supabase Storage
                  // Por ahora simulamos que se agregaron
                  setAccessoryPhotos(prev => [...prev, "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&auto=format&fit=crop&q=60"]);
                }}
              />
              <label htmlFor="photo-upload" className="mt-6 px-10 py-4 bg-[var(--heading)] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--accent)] transition-all cursor-pointer shadow-xl shadow-blue-500/10">
                Seleccionar Imágenes
              </label>
            </div>
          </div>
    
          {accessoryPhotos.length > 0 && (
            <div className="grid grid-cols-4 gap-4 mb-10">
              {accessoryPhotos.map((p, idx) => (
                <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-white shadow-md group/photo">
                  <img src={p} className="w-full h-full object-cover" />
                  <button 
                    onClick={() => setAccessoryPhotos(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute top-2 right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/photo:opacity-100 transition-all"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
    
          <div className="flex gap-4">
            <Button variant="outline" className="flex-1 h-20 rounded-2xl font-black uppercase text-xs" onClick={() => setReceptionStep('classification')}>Cancelar</Button>
            <Button 
              className="flex-[2] h-20 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl shadow-2xl shadow-emerald-500/20 font-black uppercase text-xs"
              onClick={() => setReceptionStep('sub_bodega_transfer')}
            >
              Continuar con la Transferencia
            </Button>
          </div>
        </Card>
      </div>
  );
}
