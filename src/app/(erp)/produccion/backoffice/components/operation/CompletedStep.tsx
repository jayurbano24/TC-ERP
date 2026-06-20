'use client';

import React from 'react';
import { Button } from '@/components/ui';
import { CheckCircle2 } from 'lucide-react';
import type { OperationContext } from '../../operation/operationContext';

type Props = { ctx: OperationContext };

export function CompletedStep({ ctx }: Props) {
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
      <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border-2 border-slate-100 shadow-xl animate-rise-in">
        <div className="bg-emerald-100 p-10 rounded-full mb-8"><CheckCircle2 className="w-20 h-20 text-emerald-500" /></div>
        <h3 className="text-3xl font-black text-[#181c3a] mb-4 uppercase">Proceso Finalizado</h3>
        <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em] mb-12 text-center max-w-sm">
          La información ha sido procesada {category === 'Accesorio' ? 'y la agencia ha sido notificada vía correo.' : 'y enviada a bodega.'}
        </p>
        <Button variant="primary" className="bg-[#181c3a] px-12 h-16 rounded-2xl font-black uppercase text-xs" onClick={() => { fetchHistory(); setReceptionStep('classification'); setGuideItems([]); setScannedGuides([]); setAgencia(''); setReturnReason(''); setSelectedItemIdx(null); setItemSeriesInputs({}); setAccessoryPhotos([]); setSapGroups([]); setActiveSapGroupId(null); setSapTransferNumber(''); }}>Siguiente Caja</Button>
      </div>
  );
}
