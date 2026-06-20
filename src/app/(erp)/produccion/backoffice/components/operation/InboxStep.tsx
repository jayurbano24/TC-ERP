'use client';

import React from 'react';
import { Badge, Button, Card } from '@/components/ui';
import { Box, Clock, Printer, Radio, RefreshCw, Search, Trash2 } from 'lucide-react';
import { formatDisplayDateTime } from '@/lib/formatDisplayDate';
import type { OperationContext } from '../../operation/operationContext';

type Props = { ctx: OperationContext };

export function InboxStep({ ctx }: Props) {
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
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-black text-[#181c3a] uppercase tracking-tight">Bandeja de Entrada (CAC)</h2>
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2">Recepciones pendientes de validación administrativa</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleTestConnection} className="font-black text-[10px] uppercase border-amber-200 text-amber-600 hover:bg-amber-50">
              <Radio size={14} className="mr-2" /> Test Conexión
            </Button>
            <Button variant="outline" onClick={() => { fetchPending(); fetchHistory(); }} className="font-black text-[10px] uppercase">
              <RefreshCw size={14} className={`mr-2 ${loading || historyLoading ? 'animate-spin' : ''}`} /> Refrescar
            </Button>
          </div>
        </div>
    
        <div className="relative max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Escanea o escribe el número de guía..."
            className="w-full bg-white border-2 border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-black text-[#181c3a] outline-none focus:border-[#2ec4f1] focus:ring-4 focus:ring-[#2ec4f1]/10 transition-all placeholder:font-bold placeholder:text-slate-300"
            value={inboxSearch}
            onChange={(e) => setInboxSearch(e.target.value)}
            autoFocus
          />
        </div>
    
        {inboxLoadError && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">Error al cargar la bandeja</p>
              <p className="text-xs font-bold text-amber-700 mt-1">{inboxLoadError}</p>
            </div>
            <Button variant="outline" onClick={() => fetchPending()} className="font-black text-[10px] uppercase border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0">
              <RefreshCw size={14} className="mr-2" /> Reintentar
            </Button>
          </div>
        )}
    
        <div className="grid grid-cols-1 gap-4">
          {loading && pendingReceptions.length === 0 && !inboxLoadError && (
            <div className="py-24 text-center bg-white rounded-3xl border-2 border-slate-100">
              <RefreshCw className="w-10 h-10 mx-auto mb-4 text-[#2ec4f1] animate-spin" />
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Cargando bandeja...</p>
            </div>
          )}
          {pendingReceptions.filter(rec => rec.status !== 'ARCHIVADO' && rec.status !== 'RECIBIDO' && (!inboxSearch || rec.guide_number.toLowerCase().includes(inboxSearch.toLowerCase()))).map((rec) => (
            <Card key={rec.id} className={`overflow-hidden border-2 transition-all group p-0 ${rec.status === 'PENDIENTE_BACKOFFICE' ? 'border-rose-400 hover:border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.15)] bg-rose-50/30' : 'border-slate-100 hover:border-[#2ec4f1]/30'}`}>
              <div className="flex flex-col md:flex-row">
                <div className={`md:w-56 p-4 text-white flex flex-col justify-between ${rec.status === 'PENDIENTE_BACKOFFICE' ? 'bg-gradient-to-br from-rose-900 to-rose-950' : 'bg-[#181c3a]'}`}>
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <Badge className={`border-none font-black text-[9px] uppercase ${rec.status === 'PENDIENTE_BACKOFFICE' ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'bg-[#2ec4f1] text-[#181c3a]'}`}>
                        {rec.status === 'PENDIENTE_BACKOFFICE' ? 'REVERTIDO DE DEVOLUCIÓN' : rec.status}
                      </Badge>
                      <Box size={20} className="text-white/20" />
                    </div>
                    <h4 className="text-lg font-black font-mono">{rec.guide_number}</h4>
                    <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest mt-0.5">LOTE ID: {rec.id.substring(0,8)}</p>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <Clock className={`w-3 h-3 ${rec.status === 'PENDIENTE_BACKOFFICE' ? 'text-rose-400' : 'text-[#2ec4f1]'}`} />
                    <span className="text-[10px] font-bold text-white/60">{formatDisplayDateTime(rec.created_at)}</span>
                  </div>
                </div>
                <div className="flex-1 p-4 flex flex-col justify-between">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Transportista</p>
                      <p className="text-sm font-black text-[#181c3a] leading-tight">{rec.carrier || '---'}</p>
                      <p className="text-[8px] font-bold text-[#2ec4f1] uppercase mt-0.5">Recibido por: {rec.received_by || 'SISTEMA'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Unidades</p>
                      <p className="text-sm font-black text-[#181c3a] leading-tight">{rec.received_units} BULTOS</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Ubicación Actual</p>
                      <p className="text-sm font-black text-emerald-500 uppercase leading-tight">MUELLE DE CARGA</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-50 flex flex-col sm:flex-row justify-between items-center gap-3">
                    <div className="flex gap-4">
                      <button onClick={() => handlePrintConduce(rec)} className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-[#181c3a] transition-all uppercase tracking-widest">
                        <Printer size={14} /> Imprimir Conduce
                      </button>
                      <button className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-rose-500 transition-all uppercase tracking-widest">
                        <Trash2 size={14} /> Rechazar
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="primary" onClick={() => startProcessingReception(rec)} className="rounded-xl bg-[#181c3a] text-white hover:bg-[#2ec4f1] transition-all font-black text-[9px] uppercase tracking-widest px-6 py-2">Procesar e Ingresar</Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {pendingReceptions.filter(rec => rec.status !== 'ARCHIVADO' && (!inboxSearch || rec.guide_number.toLowerCase().includes(inboxSearch.toLowerCase()))).length === 0 && !loading && !inboxLoadError && (
            <div className="py-24 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100">
              <Box className="w-16 h-16 mx-auto mb-4 text-slate-200" />
              <p className="text-sm font-black text-slate-300 uppercase tracking-widest">No hay recepciones pendientes en la bandeja</p>
            </div>
          )}
        </div>
      </div>
  );
}
