'use client';

import type React from 'react';
import type { BackofficeTab, BackofficeReception, CatalogAgency, CatalogBrand, CatalogModel, CatalogTech, GuideItem, ReceptionStep, SapTransferGroup } from '../types';
import type { CompleteGuidesContext } from './completeGuidesContext';
import { runCompleteCurrentGuides } from './completeCurrentGuides';
import { getPendingGuides } from './classificationGuideUtils';

export type CompleteFlowParams = {
  isSubmitting: boolean;
  isSubmittingRef: React.MutableRefObject<boolean>;
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  scannedGuides: string[];
  processedGuides: string[];
  setProcessedGuides: React.Dispatch<React.SetStateAction<string[]>>;
  activeReception: BackofficeReception | null;
  category: 'Equipo' | 'Accesorio' | 'Teléfono';
  receptionStep: ReceptionStep;
  guideItems: GuideItem[];
  sapGroups: SapTransferGroup[];
  sapTransferNumber: string;
  selectedAgencyId: string;
  returnReason: string;
  returnTracking: string;
  returnCourier: string;
  accessoryPhotos: string[];
  CAC_AGENCIES: CatalogAgency[];
  MASTER_TECNOLOGIAS: CatalogTech[];
  MASTER_MARCAS: CatalogBrand[];
  MASTER_MODELOS: CatalogModel[];
  currentUserFullName: string;
  setReceptionStep: React.Dispatch<React.SetStateAction<ReceptionStep>>;
  setActiveTab: React.Dispatch<React.SetStateAction<BackofficeTab>>;
  setHistorySearch: React.Dispatch<React.SetStateAction<string>>;
  setHistoryPage: React.Dispatch<React.SetStateAction<number>>;
  fetchHistory: (opts?: { silent?: boolean }) => Promise<void>;
  setScannedGuides: React.Dispatch<React.SetStateAction<string[]>>;
  setAgencia: React.Dispatch<React.SetStateAction<string>>;
  setReturnReason: React.Dispatch<React.SetStateAction<string>>;
  setAccessoryPhotos: React.Dispatch<React.SetStateAction<string[]>>;
  resetManifestState: () => void;
  fetchPending: (opts?: { silent?: boolean }) => Promise<void>;
  setActiveReception: React.Dispatch<React.SetStateAction<BackofficeReception | null>>;
};

function buildCompleteCtx(params: CompleteFlowParams): CompleteGuidesContext {
  return {
    isSubmitting: params.isSubmitting,
    isSubmittingRef: params.isSubmittingRef,
    setIsSubmitting: params.setIsSubmitting,
    scannedGuides: params.scannedGuides,
    processedGuides: params.processedGuides,
    setProcessedGuides: params.setProcessedGuides,
    activeReception: params.activeReception,
    category: params.category,
    receptionStep: params.receptionStep,
    guideItems: params.guideItems,
    sapGroups: params.sapGroups,
    sapTransferNumber: params.sapTransferNumber,
    selectedAgencyId: params.selectedAgencyId,
    returnReason: params.returnReason,
    returnTracking: params.returnTracking,
    returnCourier: params.returnCourier,
    accessoryPhotos: params.accessoryPhotos,
    CAC_AGENCIES: params.CAC_AGENCIES,
    MASTER_TECNOLOGIAS: params.MASTER_TECNOLOGIAS,
    MASTER_MARCAS: params.MASTER_MARCAS,
    MASTER_MODELOS: params.MASTER_MODELOS,
    currentUserFullName: params.currentUserFullName,
    setReceptionStep: params.setReceptionStep,
    setActiveTab: params.setActiveTab,
    setHistorySearch: params.setHistorySearch,
    setHistoryPage: params.setHistoryPage,
    fetchHistory: params.fetchHistory,
  };
}

export function createCompleteFlowHandlers(params: CompleteFlowParams) {
  const completeCurrentGuides = async () => {
    await runCompleteCurrentGuides(buildCompleteCtx(params));
  };

  const handleConfirmReturn = async () => {
    if (!params.returnReason) {
      alert('Por favor ingrese el motivo de la devolución.');
      return;
    }
    await completeCurrentGuides();
  };

  const onCompletedNextBox = () => {
    void params.fetchHistory();
    params.resetManifestState();
    params.setScannedGuides([]);
    params.setReturnReason('');
    params.setAccessoryPhotos([]);

    const pending =
      params.activeReception != null
        ? getPendingGuides(params.activeReception, params.processedGuides)
        : [];

    if (pending.length === 0) {
      void params.fetchPending();
      params.setActiveReception(null);
      params.setReceptionStep('category_selection');
      return;
    }

    params.setReceptionStep('classification');
  };

  return { completeCurrentGuides, handleConfirmReturn, onCompletedNextBox };
}
