'use client';

import React from 'react';
import { Button, Card, notify } from '@/components/ui';
import { Camera, ChevronLeft, FileText, X } from 'lucide-react';
import type { OperationContext } from '../../operation/operationContext';
import { getReceiverName } from '../../backofficeHelpers';

type Props = { ctx: OperationContext };

export function ReturnConfirmationStep({ ctx }: Props) {
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
    
        <Card className="p-10 border-none shadow-2xl rounded-[2.5rem] bg-white text-center">
          <div className="bg-amber-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 text-amber-500">
            <FileText size={40} />
          </div>
          <h2 className="text-3xl font-black text-[#181c3a] uppercase mb-4">Confirmación de Devolución</h2>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mb-12">Se enviará una notificación formal a la agencia</p>
    
          <div className="bg-slate-50 p-8 rounded-3xl text-left mb-8 border border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div 
                onClick={() => setShowAgencyModal(true)}
                className="cursor-pointer hover:bg-slate-100 p-4 -m-4 rounded-2xl transition-all border-2 border-transparent hover:border-slate-200"
              >
                <p className="text-[9px] font-black text-slate-400 uppercase mb-2 flex items-center gap-2">
                  Notificar a Encargado (Agencia)
                  <span className="bg-[#2ec4f1]/10 text-[#2ec4f1] px-2 py-0.5 rounded-full text-[8px]">Cambiar Agencia</span>
                </p>
                <p className="text-sm font-black text-[#181c3a] uppercase">{agencyDetails ? `${agencyDetails.name} - ${agencyDetails.manager || 'SIN ENCARGADO'}` : 'SELECCIONAR AGENCIA...'}</p>
                <p className="text-[10px] font-bold text-[#2ec4f1] lowercase mt-1">
                  {agencyDetails?.email || 'correo@claro.com.gt'}
                  {activeReception && getReceiverName(activeReception) !== 'SISTEMA' && (
                    <span className="text-slate-400 ml-2 text-[9px] uppercase">+ CC: {getReceiverName(activeReception)}</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Guías de Recepción</p>
                <p className="text-sm font-black text-[#181c3a] font-mono">{scannedGuides.join(', ')}</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase">Guía de Envío</label>
                    <input 
                      type="text" 
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg font-bold text-xs outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="No. Guía"
                      value={returnTracking}
                      onChange={(e) => setReturnTracking(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase">Logística (Courier)</label>
                    <input 
                      type="text" 
                      className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg font-bold text-xs outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="Ej. Guatex, Cargo Expreso"
                      value={returnCourier}
                      onChange={(e) => setReturnCourier(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
    
            <div className="space-y-3">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[9px] font-black text-slate-400 uppercase">Motivo de la Devolución</label>
              </div>
              <textarea 
                className="w-full p-6 bg-white border border-slate-200 rounded-2xl font-bold text-sm text-[#181c3a] outline-none focus:ring-2 focus:ring-amber-500 min-h-[120px] transition-all"
                placeholder="Ej. Material no corresponde al manifiesto / Daño físico detectado..."
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
              />
            </div>
    
            <div className="mt-8 border-t border-slate-200 pt-8">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <p className="text-[10px] font-black text-[#181c3a] uppercase">Evidencia Fotográfica</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Sube hasta 5 fotos (se comprimirán automáticamente)</p>
                </div>
                <input 
                  type="file" 
                  multiple 
                  accept="image/*"
                  className="hidden" 
                  id="return-photo-upload" 
                  onChange={async (e) => {
                    if (e.target.files) {
                      const files = Array.from(e.target.files);
                      if (accessoryPhotos.length + files.length > 5) {
                        notify.warning("Solo puedes subir un máximo de 5 fotos.");
                        return;
                      }
                      try {
                        const compressed = await Promise.all(files.map(compressImage));
                        setAccessoryPhotos(prev => [...prev, ...compressed]);
                      } catch (err) {
                        console.error(err);
                        notify.error("Error al procesar las imágenes.");
                      }
                    }
                  }}
                />
                <label htmlFor="return-photo-upload" className="px-6 py-3 bg-slate-100 text-[#181c3a] rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#2ec4f1] hover:text-white transition-all cursor-pointer shadow-sm flex items-center gap-2">
                  <Camera size={14} /> Agregar Fotos
                </label>
              </div>
    
              {accessoryPhotos.length > 0 && (
                <div className="grid grid-cols-5 gap-3 mt-4">
                  {accessoryPhotos.map((p, idx) => (
                    <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group/photo">
                      <img src={p} className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setAccessoryPhotos(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/photo:opacity-100 transition-all shadow-md"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
    
          <div className="flex gap-4">
            <Button variant="outline" className="flex-1 h-16 rounded-2xl font-black uppercase text-xs" onClick={() => setReceptionStep('classification')}>Cancelar</Button>
            <Button 
              className={`flex-[2] h-16 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl shadow-xl shadow-amber-500/20 font-black uppercase text-xs ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={handleConfirmReturn}
              disabled={isSubmitting || !selectedAgencyId || !returnReason.trim()}
            >
              {isSubmitting ? 'Procesando...' : 'Confirmar y Enviar Notificación'}
            </Button>
          </div>
        </Card>
      </div>
  );
}
