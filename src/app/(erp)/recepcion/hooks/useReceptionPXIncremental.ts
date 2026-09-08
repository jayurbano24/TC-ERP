'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CurrentEntry } from '../types/reception.types';
import type { PxFinalizeProgress } from '../services/pxIncrementalApi';
import { fetchPxInProgressList } from '../services/pxIncrementalApi';
import { getCurrentReceptionActor } from '@/modules/recepcion/client/receptionActor';
import { usePxReceptionSession } from './usePxReceptionSession';
import { usePxReceptionSnapshotQuery } from './usePxReceptionSnapshotQuery';
import { usePxOperationalState } from './usePxOperationalState';
import type { PxUiState } from './usePxUiState';
import type { PxBoxCommandContext, PxCatalogBrand, PxCatalogModel } from '@/modules/recepcion/application/px/pxCommandTypes';
import {
  executeAcquireBoxLock,
  executeAddLotToBox,
  executeAdjustBoxQuantity,
  executeCloseBox,
  executeDeleteBox,
  executeDeleteEquipment,
  executeReopenBox,
  fetchFreshBoxVersion,
} from '@/modules/recepcion/application/px/pxBoxCommands';
import {
  executeFinalizeReception,
  executeResumeReception,
  executeSaveHeader,
  executeStartReception,
} from '@/modules/recepcion/application/px/pxReceptionCommands';
import { executePxScanSubmit } from '@/modules/recepcion/application/px/pxScanSubmit';

const LEGACY_STORAGE_KEY = 'tc_erp_px_reception_state';

type UseReceptionPXIncrementalArgs = {
  ui: PxUiState;
  currentUserFullName: string;
  systemBrands: PxCatalogBrand[];
  systemModels: PxCatalogModel[];
  onHistoryRefresh?: () => Promise<void>;
};

/**
 * Composition layer — conecta UI, estado operacional derivado y comandos explícitos.
 * NO contiene lógica HTTP directa ni effects de hidratación snapshot.
 */
export function useReceptionPXIncremental({
  ui,
  currentUserFullName,
  systemBrands,
  systemModels,
  onHistoryRefresh,
}: UseReceptionPXIncrementalArgs) {
  const {
    guideData: uiGuideData,
    setGuideData,
    selectedBoxForScan,
    setSelectedBoxForScan,
    currentScans,
    setCurrentScans,
    isReceptionStarted,
    setIsReceptionStarted,
  } = ui;

  const queryClient = useQueryClient();
  const session = usePxReceptionSession();
  const incrementalReceptionId = session.receptionId;
  const snapshotQuery = usePxReceptionSnapshotQuery(incrementalReceptionId);
  const snapshotEntry = snapshotQuery.data ?? session.snapshotEntry;

  const operational = usePxOperationalState({
    snapshotEntry,
    uiGuideData,
    isReceptionStarted,
  });

  const [pxInProgressList, setPxInProgressList] = useState<Array<Record<string, unknown>>>([]);
  const [lastSyncedAt, setLastSyncedAtLocal] = useState<string | null>(null);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const operatorIdRef = useRef<string | null>(null);
  const [isScanning] = useState(false);
  const [finalizeProgress, setFinalizeProgress] = useState<PxFinalizeProgress | null>(null);

  operatorIdRef.current = operatorId;

  useEffect(() => {
    if (
      snapshotEntry &&
      (snapshotEntry.reason === 'RESUME' || snapshotEntry.reason === 'START')
    ) {
      setIsReceptionStarted(true);
    }
    if (snapshotEntry) {
      setLastSyncedAtLocal(new Date().toISOString());
    }
  }, [snapshotEntry, setIsReceptionStarted]);

  const ensureOperatorId = useCallback(async (): Promise<string | null> => {
    if (operatorIdRef.current) return operatorIdRef.current;
    const actor = await getCurrentReceptionActor();
    if (actor.userId) {
      operatorIdRef.current = actor.userId;
      setOperatorId(actor.userId);
    }
    return actor.userId;
  }, []);

  const getFreshBoxVersion = useCallback(
    (boxCode: string) =>
      fetchFreshBoxVersion(
        queryClient,
        boxCode,
        operational.boxIdByCodeRef.current[boxCode],
        operational.mutators,
        operational.boxMetaRef,
        operational.boxVersionByCodeRef
      ),
    [queryClient, operational.boxMetaRef, operational.boxIdByCodeRef, operational.boxVersionByCodeRef, operational.mutators]
  );

  useEffect(() => {
    if (!finalizeProgress) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [finalizeProgress]);

  const loadInProgressList = useCallback(async () => {
    try {
      const list = await fetchPxInProgressList();
      setPxInProgressList(list);
    } catch {
      setPxInProgressList([]);
    }
  }, []);

  useEffect(() => {
    getCurrentReceptionActor().then((actor) => {
      operatorIdRef.current = actor.userId;
      setOperatorId(actor.userId);
    });
    loadInProgressList();
    try {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (parsed.scannedSeries?.length > 0 || parsed.manifestItems?.length > 0) {
          console.warn(
            '[PX] Datos legacy en localStorage detectados. Finalice o exporte antes de usar captura en servidor.'
          );
        }
      }
    } catch {
      /* ignore */
    }
  }, [loadInProgressList]);

  const onAcquireBoxLock = useCallback(
    (boxCode: string, boxId: string) =>
      executeAcquireBoxLock(
        {
          operatorName: currentUserFullName,
          ensureOperatorId,
          mutators: operational.mutators,
          boxMetaRef: operational.boxMetaRef,
        },
        boxCode,
        boxId
      ),
    [currentUserFullName, ensureOperatorId, operational.mutators, operational.boxMetaRef]
  );

  const boxCommandContext = useMemo<PxBoxCommandContext>(
    () => ({
      queryClient,
      receptionId: incrementalReceptionId,
      operatorName: currentUserFullName,
      ensureOperatorId,
      operatorId,
      guideData: operational.guideData,
      boxIdByCode: operational.boxIdByCode,
      boxMetaByCode: operational.boxMetaByCode,
      boxVersionByCode: operational.boxVersionByCode,
      manifestItems: operational.manifestItems,
      closedBoxes: operational.closedBoxes,
      selectedBoxForScan,
      systemBrands,
      systemModels,
      mutators: operational.mutators,
      boxMetaRef: operational.boxMetaRef,
      boxIdByCodeRef: operational.boxIdByCodeRef,
      boxVersionByCodeRef: operational.boxVersionByCodeRef,
      scannedSeriesRef: operational.scannedSeriesRef,
      setSelectedBoxForScan,
      session,
      getFreshBoxVersion,
      onAcquireBoxLock,
    }),
    [
      queryClient,
      incrementalReceptionId,
      currentUserFullName,
      ensureOperatorId,
      operatorId,
      operational,
      selectedBoxForScan,
      systemBrands,
      systemModels,
      setSelectedBoxForScan,
      session,
      getFreshBoxVersion,
      onAcquireBoxLock,
    ]
  );

  const onStartReceptionIncremental = useCallback(
    () =>
      executeStartReception({
        guideData: operational.guideData,
        receptionVersion: operational.receptionVersion,
        operatorId,
        operatorName: currentUserFullName,
        receptionId: incrementalReceptionId,
        boxMetaByCode: operational.boxMetaByCode,
        closedBoxes: operational.closedBoxes,
        scannedSeries: operational.scannedSeries,
        session,
        setGuideData,
        setIsReceptionStarted,
        loadInProgressList,
        onHistoryRefresh,
        setFinalizeProgress,
        resetOperationalState: operational.resetOperationalState,
      }),
    [
      operational,
      operatorId,
      currentUserFullName,
      incrementalReceptionId,
      session,
      setGuideData,
      setIsReceptionStarted,
      loadInProgressList,
      onHistoryRefresh,
    ]
  );

  const onResumePxReception = useCallback(
    (receptionId: string) => executeResumeReception({ session, setIsReceptionStarted }, receptionId),
    [session, setIsReceptionStarted]
  );

  const onAddLotToBoxIncremental = useCallback(
    (boxCode: string, currentEntry: CurrentEntry) => executeAddLotToBox(boxCommandContext, boxCode, currentEntry),
    [boxCommandContext]
  );

  const onScanPxIncremental = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void executePxScanSubmit({
        receptionId: incrementalReceptionId,
        selectedBoxForScan,
        currentScans,
        manifestItems: operational.manifestItems,
        boxIdByCode: operational.boxIdByCode,
        boxMetaByCode: operational.boxMetaByCode,
        boxVersionByCode: operational.boxVersionByCode,
        systemBrands,
        systemModels,
        operatorName: currentUserFullName,
        ensureOperatorId,
        operatorIdRef,
        onAcquireBoxLock,
        session,
        mutators: operational.mutators,
        setCurrentScans,
        setLastSyncedAt: setLastSyncedAtLocal,
        scannedSeriesRef: operational.scannedSeriesRef,
        boxMetaRef: operational.boxMetaRef,
        getLiveScannedSeries: () =>
          operational.scannedSeriesRef.current.length > 0
            ? operational.scannedSeriesRef.current
            : operational.scannedSeries,
      });
    },
    [
      incrementalReceptionId,
      selectedBoxForScan,
      currentScans,
      operational,
      systemBrands,
      systemModels,
      currentUserFullName,
      ensureOperatorId,
      onAcquireBoxLock,
      session,
      setCurrentScans,
    ]
  );

  const onDeleteEquipmentIncremental = useCallback(
    (boxCode: string, item: { equipmentId?: string; sn: string }) =>
      executeDeleteEquipment(boxCommandContext, boxCode, item),
    [boxCommandContext]
  );

  const onDeleteBoxIncremental = useCallback(
    (boxCode: string) => executeDeleteBox(boxCommandContext, boxCode),
    [boxCommandContext]
  );

  const onCloseBoxIncremental = useCallback(
    (boxCode: string) => executeCloseBox(boxCommandContext, boxCode),
    [boxCommandContext]
  );

  const onReopenBoxIncremental = useCallback(
    (boxCode: string) => executeReopenBox(boxCommandContext, boxCode),
    [boxCommandContext]
  );

  const onAdjustBoxQuantity = useCallback(
    (boxCode: string, newQty: number, reason: string) =>
      executeAdjustBoxQuantity(boxCommandContext, boxCode, newQty, reason),
    [boxCommandContext]
  );

  const onSaveHeaderIncremental = useCallback(
    () =>
      executeSaveHeader({
        guideData: operational.guideData,
        receptionVersion: operational.receptionVersion,
        operatorId,
        operatorName: currentUserFullName,
        receptionId: incrementalReceptionId,
        boxMetaByCode: operational.boxMetaByCode,
        closedBoxes: operational.closedBoxes,
        scannedSeries: operational.scannedSeries,
        session,
        setGuideData,
        setIsReceptionStarted,
        loadInProgressList,
        onHistoryRefresh,
        setFinalizeProgress,
        resetOperationalState: operational.resetOperationalState,
      }),
    [operational, operatorId, currentUserFullName, incrementalReceptionId, session, setGuideData, setIsReceptionStarted, loadInProgressList, onHistoryRefresh]
  );

  const handleFinalizePXIncremental = useCallback(
    () =>
      executeFinalizeReception({
        guideData: operational.guideData,
        receptionVersion: operational.receptionVersion,
        operatorId,
        operatorName: currentUserFullName,
        receptionId: incrementalReceptionId,
        boxMetaByCode: operational.boxMetaByCode,
        closedBoxes: operational.closedBoxes,
        scannedSeries: operational.scannedSeries,
        session,
        setGuideData,
        setIsReceptionStarted,
        loadInProgressList,
        onHistoryRefresh,
        setFinalizeProgress,
        resetOperationalState: operational.resetOperationalState,
      }),
    [operational, operatorId, currentUserFullName, incrementalReceptionId, session, setGuideData, setIsReceptionStarted, loadInProgressList, onHistoryRefresh]
  );

  return {
    useIncrementalCapture: true as const,
    incrementalReceptionId,
    manifestItems: operational.manifestItems,
    scannedSeries: operational.scannedSeries,
    closedBoxes: operational.closedBoxes,
    guideData: operational.guideData,
    setGuideData,
    setManifestItems: operational.mutators.setManifestItems,
    setScannedSeries: operational.mutators.setScannedSeries,
    setClosedBoxes: operational.mutators.setClosedBoxes,
    boxMetaByCode: operational.boxMetaByCode,
    boxIdByCode: operational.boxIdByCode,
    pxInProgressList,
    isLoadingIncrementalResume: session.isLoadingResume,
    lastSyncedAt,
    currentOperatorId: operatorId,
    isScanning,
    onStartReceptionIncremental,
    onResumePxReception,
    onAddLotToBoxIncremental,
    onAcquireBoxLock,
    onAdjustBoxQuantity,
    onCloseBoxIncremental,
    onReopenBoxIncremental,
    onSaveHeaderIncremental,
    onScanPxIncremental,
    onDeleteEquipmentIncremental,
    onDeleteBoxIncremental,
    handleFinalizePXIncremental,
    finalizeProgress,
    refreshSnapshot: () => session.refresh('EXPLICIT_REFRESH'),
  };
}
