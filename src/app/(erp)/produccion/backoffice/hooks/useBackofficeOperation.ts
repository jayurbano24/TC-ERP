'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { testSupabaseConnection } from '@/lib/supabase/test-connection';
import type { BackofficeTab, BackofficeReception, ReceptionStep } from '../types';
import { compressImage } from '../backofficeHelpers';
import { useBackofficeCatalogs } from './useBackofficeCatalogs';
import { useBackofficeHistory } from './useBackofficeHistory';
import { useBackofficeModals } from './useBackofficeModals';
import { useBackofficeInbox } from './useBackofficeInbox';
import { useBackofficeManifest } from './useBackofficeManifest';
import { useBackofficeHistoryActions } from './useBackofficeHistoryActions';
import { useBackofficeSession } from './useBackofficeSession';
import { useBackofficeLifecycle } from './useBackofficeLifecycle';
import { printConduce } from '../operation/printConduce';
import { runUndoClassification } from '../operation/undoClassification';
import { createCompleteFlowHandlers } from '../operation/completeFlow';
import { buildOperationContext } from '../operation/buildOperationContext';

export function useBackofficeOperation() {
  const {
    CAC_AGENCIES,
    MASTER_TECNOLOGIAS,
    MASTER_MARCAS,
    MASTER_MODELOS,
    loadCatalogs,
    resolveSeriesPerUnit,
  } = useBackofficeCatalogs();

  const [activeTab, setActiveTab] = useState<BackofficeTab>('op');
  const [receptionStep, setReceptionStep] = useState<ReceptionStep>('category_selection');
  const [accessoryPhotos, setAccessoryPhotos] = useState<string[]>([]);
  const [scannedGuides, setScannedGuides] = useState<string[]>([]);
  const [processedGuides, setProcessedGuides] = useState<string[]>([]);
  const [inboxSearch, setInboxSearch] = useState('');
  const [classificationSearch, setClassificationSearch] = useState('');
  const [dateFilterFrom, setDateFilterFrom] = useState('');
  const [dateFilterTo, setDateFilterTo] = useState('');
  const [agencia, setAgencia] = useState('');
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>('');
  const [category, setCategory] = useState<'Equipo' | 'Accesorio' | 'Teléfono'>('Equipo');
  const [returnReason, setReturnReason] = useState('');
  const [returnTracking, setReturnTracking] = useState('');
  const [returnCourier, setReturnCourier] = useState('');
  const [activeReception, setActiveReception] = useState<BackofficeReception | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = React.useRef(false);

  const { currentUserFullName, canReturnToPending, processingDateLabel } = useBackofficeSession();

  const {
    historyLoadError,
    historyLoading,
    historyReceptions,
    historySearch,
    setHistorySearch,
    historyFilters,
    historyFiltersOpen,
    setHistoryFiltersOpen,
    historyPage,
    setHistoryPage,
    fetchHistory,
    getHistoryTrayEntries,
    getUnfilteredHistoryTrayEntries,
    historyFilterBrands,
    historyFilterModels,
    patchHistoryFilter,
    clearHistoryFilters,
  } = useBackofficeHistory(
    { CAC_AGENCIES, MASTER_MARCAS, MASTER_MODELOS, resolveSeriesPerUnit },
    dateFilterFrom,
    dateFilterTo
  );

  const inbox = useBackofficeInbox({
    setLoading,
    setActiveReception,
    setProcessedGuides,
    setReceptionStep,
  });

  const manifest = useBackofficeManifest({
    CAC_AGENCIES,
    MASTER_TECNOLOGIAS,
    MASTER_MARCAS,
    MASTER_MODELOS,
    activeReception,
    selectedAgencyId,
    category,
    setReceptionStep,
    setAgencia,
    setSelectedAgencyId,
  });

  const modals = useBackofficeModals({
    CAC_AGENCIES,
    MASTER_MARCAS,
    MASTER_MODELOS,
    historyReceptions,
    fetchHistory,
    resolveSeriesPerUnit,
    guideItems: manifest.guideItems,
    setGuideItems: manifest.setGuideItems,
  });

  const historyActions = useBackofficeHistoryActions({
    getHistoryTrayEntries,
    catalogs: { CAC_AGENCIES, MASTER_TECNOLOGIAS, MASTER_MARCAS, MASTER_MODELOS },
    dateFilterFrom,
    dateFilterTo,
    fetchPending: inbox.fetchPending,
    fetchHistory,
    currentUserFullName,
  });

  useBackofficeLifecycle({
    activeTab,
    activeReception,
    inbox,
    loadCatalogs,
    fetchHistory,
    setSelectedAgencyId,
    setAgencia,
  });

  const { completeCurrentGuides, handleConfirmReturn, onCompletedNextBox } = useMemo(
    () =>
      createCompleteFlowHandlers({
        isSubmitting,
        isSubmittingRef,
        setIsSubmitting,
        scannedGuides,
        processedGuides,
        setProcessedGuides,
        activeReception,
        category,
        receptionStep,
        guideItems: manifest.guideItems,
        sapGroups: manifest.sapGroups,
        sapTransferNumber: manifest.sapTransferNumber,
        selectedAgencyId,
        returnReason,
        returnTracking,
        returnCourier,
        accessoryPhotos,
        CAC_AGENCIES,
        MASTER_TECNOLOGIAS,
        MASTER_MARCAS,
        MASTER_MODELOS,
        currentUserFullName,
        setReceptionStep,
        setActiveTab,
        setHistorySearch,
        setHistoryPage,
        fetchHistory,
        setScannedGuides,
        setAgencia,
        setReturnReason,
        setAccessoryPhotos,
        resetManifestState: manifest.resetManifestState,
      }),
    [
      isSubmitting,
      scannedGuides,
      processedGuides,
      activeReception,
      category,
      receptionStep,
      manifest.guideItems,
      manifest.sapGroups,
      manifest.sapTransferNumber,
      selectedAgencyId,
      returnReason,
      returnTracking,
      returnCourier,
      accessoryPhotos,
      CAC_AGENCIES,
      MASTER_TECNOLOGIAS,
      MASTER_MARCAS,
      MASTER_MODELOS,
      currentUserFullName,
      fetchHistory,
      manifest.resetManifestState,
    ]
  );

  const agencyDetails = CAC_AGENCIES.find((a) => a.id === selectedAgencyId);
  const handlePrintConduce = (record: BackofficeReception) => printConduce(record);

  const handleTestConnection = async () => {
    setLoading(true);
    const result = await testSupabaseConnection();
    if (result.success) {
      alert('✅ Conexión exitosa con Supabase');
      await inbox.fetchPending();
      if (activeTab === 'history') await fetchHistory();
    } else {
      alert(`❌ Error de conexión: ${result.error}`);
      inbox.setInboxLoadError(result.error || 'Error de conexión con Supabase');
    }
    setLoading(false);
  };

  const handleUndoClassification = (guia: string) =>
    runUndoClassification(
      {
        activeReception,
        processedGuides,
        setProcessedGuides,
        setActiveReception,
        setLoading,
        fetchPending: inbox.fetchPending,
        fetchHistory,
      },
      guia
    );

  const operationCtx = buildOperationContext({
    receptionStep,
    setReceptionStep,
    activeReception,
    setActiveReception,
    accessoryPhotos,
    setAccessoryPhotos,
    scannedGuides,
    setScannedGuides,
    processedGuides,
    setProcessedGuides,
    inboxSearch,
    setInboxSearch,
    classificationSearch,
    setClassificationSearch,
    agencia,
    setAgencia,
    selectedAgencyId,
    setSelectedAgencyId,
    category,
    setCategory,
    returnReason,
    setReturnReason,
    returnTracking,
    setReturnTracking,
    returnCourier,
    setReturnCourier,
    loading,
    isSubmitting,
    processingDateLabel,
    currentUserFullName,
    historyLoading,
    CAC_AGENCIES,
    MASTER_TECNOLOGIAS,
    MASTER_MARCAS,
    MASTER_MODELOS,
    agencyDetails,
    manifest,
    inbox,
    modals,
    handlePrintConduce,
    fetchHistory,
    handleTestConnection,
    handleUndoClassification,
    completeCurrentGuides,
    handleConfirmReturn,
    onCompletedNextBox,
    compressImage,
  });

  return {
    activeTab,
    setActiveTab,
    operationCtx,
    historyLoadError,
    historyLoading,
    historyReceptions,
    historySearch,
    setHistorySearch,
    historyFilters,
    historyFiltersOpen,
    setHistoryFiltersOpen,
    historyPage,
    setHistoryPage,
    fetchHistory,
    getHistoryTrayEntries,
    getUnfilteredHistoryTrayEntries,
    historyFilterBrands,
    historyFilterModels,
    patchHistoryFilter,
    clearHistoryFilters,
    dateFilterFrom,
    dateFilterTo,
    setDateFilterFrom,
    setDateFilterTo,
    CAC_AGENCIES,
    MASTER_TECNOLOGIAS,
    MASTER_MARCAS,
    MASTER_MODELOS,
    canReturnToPending,
    handleExportReport: historyActions.handleExportReport,
    handleSapBlockReturn: historyActions.handleSapBlockReturn,
    handleReturnToPending: historyActions.handleReturnToPending,
    handlePrintConduce,
    allReceptions: inbox.allReceptions,
    setAllReceptions: inbox.setAllReceptions,
    startProcessingReception: inbox.startProcessingReception,
    setSelectedAgencyId,
    ...modals,
  };
}
