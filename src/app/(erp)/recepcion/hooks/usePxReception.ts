'use client';

import { useState, useMemo } from 'react';
import { notify, confirmDialog, promptDialog } from '@/components/ui';
import { useClientPagination } from '@/hooks/useClientPagination';
import {
  canClosePxBox,
  getPxActiveBoxCodes,
  getPxBoxStats,
  validatePxFinalizeReadiness,
  validatePxIncrementalFinalizeReadiness,
  canCreateNewPxBox,
} from '../utils/pxBoxUtils';

/**
 * C1: lógica de la pestaña de recepción PX (estado, handlers y derivados)
 * extraída de PxReceptionTab. El componente queda como orquestador de vistas.
 * No cambia comportamiento: los bloques se movieron tal cual.
 */
export function usePxReception(props: any) {
  const {
  guideData, setGuideData, currentEntry, setCurrentEntry, systemPxProviders, 
  systemTechnologies, filteredBrands, filteredModels, handleAddCaja, manifestItems, 
  scannedSeries, setScannedSeries, selectedBoxForScan, setSelectedBoxForScan, printBoxLabel, 
  setManifestItems, handleFinalizePX, handleAddSN_PX, currentScans, setCurrentScans, 
  systemModels, moduleMode, isReceptionStarted, setIsReceptionStarted, isSubmittingPX,
  closedBoxes, setClosedBoxes, lastSavedAt,
  useIncrementalCapture, onStartReceptionIncremental, onAddLotToBoxIncremental,
  pxInProgressList, onResumePxReception, isLoadingIncrementalResume, incrementalReceptionId,
  boxMetaByCode, onAcquireBoxLock, onAdjustBoxQuantity, onCloseBoxIncremental,
  onReopenBoxIncremental, onSaveHeaderIncremental, currentOperatorId,
  onDeleteEquipmentIncremental, onDeleteBoxIncremental
  } = props;

  const [activeBoxNum, setActiveBoxNum] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'dashboard' | 'box_detail'>('dashboard');
  const [isEditingHeader, setIsEditingHeader] = useState(false);

  const pxActiveBoxCode = selectedBoxForScan || '';
  const boxScannedSeries = useMemo(
    () =>
      pxActiveBoxCode
        ? scannedSeries.filter((s: any) => s.boxCode === pxActiveBoxCode)
        : [],
    [scannedSeries, pxActiveBoxCode]
  );
  const scannedSerialUpperSet = useMemo(() => {
    const set = new Set<string>();
    for (const s of scannedSeries) {
      if (s.sn) set.add(String(s.sn).toUpperCase());
      if (s.s2) set.add(String(s.s2).toUpperCase());
      if (s.s3) set.add(String(s.s3).toUpperCase());
      if (s.s4) set.add(String(s.s4).toUpperCase());
    }
    return set;
  }, [scannedSeries]);
  const boxSeriesPagination = useClientPagination(boxScannedSeries, 25, [pxActiveBoxCode]);
  const [headerDraft, setHeaderDraft] = useState<any>(null);
  const [headerFieldErrors, setHeaderFieldErrors] = useState<{ sap?: string; docReferencia?: string }>({});
  const [isCheckingHeader, setIsCheckingHeader] = useState(false);

  const workInProgress =
    manifestItems.length > 0 || scannedSeries.length > 0;

  const checkHeaderFields = async (sap: string, docReferencia: string, showAlert = false) => {
    setIsCheckingHeader(true);
    try {
      const { receptionRepository } = await import('../repositories/receptionRepository');
      const result = await receptionRepository.validatePxHeaderUniqueness(sap, docReferencia);
      if (!result.ok) {
        setHeaderFieldErrors({ [result.field]: result.message });
        if (showAlert) notify.warning(result.message);
        return false;
      }
      setHeaderFieldErrors({});
      return true;
    } catch (e) {
      console.error(e);
      const message = 'No se pudo verificar duplicados. Verifique conexión e intente de nuevo.';
      if (showAlert) notify.error(message);
      return false;
    } finally {
      setIsCheckingHeader(false);
    }
  };

  const headerHasBlockingErrors =
    Boolean(headerFieldErrors.sap || headerFieldErrors.docReferencia);

  const openHeaderEdit = () => {
    setHeaderDraft({ ...guideData });
    setHeaderFieldErrors({});
    setIsEditingHeader(true);
  };

  const saveHeaderEdit = async () => {
    if (!guideData.sap || !guideData.proveedorPx) {
      notify.warning('Por favor complete al menos el Número de Pedido y Proveedor PX');
      return;
    }
    const isValid = await checkHeaderFields(guideData.sap, guideData.docReferencia, true);
    if (!isValid) return;
    if (useIncrementalCapture && incrementalReceptionId && onSaveHeaderIncremental) {
      const ok = await onSaveHeaderIncremental();
      if (!ok) return;
    }
    setIsEditingHeader(false);
    setHeaderDraft(null);
  };

  const cancelHeaderEdit = () => {
    if (headerDraft) setGuideData(headerDraft);
    setIsEditingHeader(false);
    setHeaderDraft(null);
  };

  const handleAbandonReception = async () => {
    if (
      workInProgress &&
      !(await confirmDialog({
        title: 'Abandonar recepción',
        message: '¿Abandonar esta recepción? Se perderán todas las cajas y series escaneadas.',
        tone: 'error',
        confirmText: 'Abandonar',
      }))
    ) {
      return;
    }
    setManifestItems([]);
    setScannedSeries([]);
    setClosedBoxes([]);
    setSelectedBoxForScan(null);
    setGuideData({
      sap: '',
      docReferencia: '',
      agencia: guideData.agencia || 'Monte Verdes',
      proveedorPx: guideData.proveedorPx || '',
      guia: '',
      piloto: '',
      courier: '',
      totalCajasEsperadas: 1,
    });
    setIsReceptionStarted(false);
    setIsEditingHeader(false);
    setHeaderDraft(null);
    setViewMode('dashboard');
    try {
      localStorage.removeItem('tc_erp_px_reception_state');
    } catch {
      /* ignore */
    }
  };

  // Funciones locales para el nuevo flujo
  const handleStartReception = async () => {
    if (!guideData.sap || !guideData.proveedorPx) {
      notify.warning("Por favor complete al menos el Número de Pedido y Proveedor PX");
      return;
    }
    if (useIncrementalCapture && onStartReceptionIncremental) {
      const ok = await onStartReceptionIncremental();
      if (ok) setViewMode('dashboard');
      return;
    }
    const isValid = await checkHeaderFields(guideData.sap, guideData.docReferencia, true);
    if (!isValid) return;
    try {
      const { receptionRepository } = await import('../repositories/receptionRepository');
      let recNumber = guideData.guia?.trim();
      if (!recNumber) {
        recNumber = await receptionRepository.resolveUniquePxGuideNumber();
      } else {
        const available = await receptionRepository.isPxGuideNumberAvailable(recNumber);
        if (!available) {
          recNumber = await receptionRepository.resolveUniquePxGuideNumber();
        }
      }
      setGuideData({ ...guideData, guia: recNumber });
      setIsReceptionStarted(true);
      setViewMode('dashboard');
    } catch (e) {
      console.error(e);
      notify.error('No se pudo asignar número de recepción (REC)', { description: 'Verifique conexión e intente de nuevo.' });
    }
  };

  const handleCreateNewBox = () => {
    if (useIncrementalCapture) {
      const limitCheck = canCreateNewPxBox(boxMetaByCode || {}, guideData.totalCajasEsperadas || 1);
      if (!limitCheck.ok) {
        notify.warning(limitCheck.reason);
        return;
      }
    }

    let maxNum = 0;
    const allCodes = useIncrementalCapture
      ? Object.keys(boxMetaByCode || {})
      : manifestItems.map((i: any) => i.boxCode);
    allCodes.forEach((code: string) => {
      const match = code.match(/CAJA-(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    });
    manifestItems.forEach((i: any) => {
      const match = i.boxCode.match(/CAJA-(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    });

    const nextNum = Math.max(maxNum, activeBoxNum) + 1;
    setActiveBoxNum(nextNum);
    const newBoxCode = `CAJA-${nextNum}`;

    setSelectedBoxForScan(newBoxCode);
    setViewMode('box_detail');
  };

  const handleEnterBox = async (boxCode: string) => {
    if (useIncrementalCapture && onAcquireBoxLock) {
      const meta = boxMetaByCode?.[boxCode];
      const isClosedServer = meta?.status === 'cerrada' || meta?.status === 'closed';
      if (meta?.id && !isClosedServer) {
        const ok = await onAcquireBoxLock(boxCode, meta.id);
        if (!ok) return;
      }
    }
    setSelectedBoxForScan(boxCode);
    setViewMode('box_detail');
  };

  const handleEditBox = async (boxCode: string) => {
    await handleEnterBox(boxCode);
  };

  const handleDeleteBox = async (boxCode: string) => {
    const isClosed =
      useIncrementalCapture && boxMetaByCode?.[boxCode]
        ? boxMetaByCode[boxCode].status === 'cerrada' || boxMetaByCode[boxCode].status === 'closed'
        : closedBoxes.includes(boxCode);
    if (isClosed) {
      notify.warning('No puede eliminar una caja cerrada. Reábrala primero si necesita modificarla.');
      return;
    }

    if (useIncrementalCapture && onDeleteBoxIncremental) {
      const ok = await onDeleteBoxIncremental(boxCode);
      if (ok) {
        if (selectedBoxForScan === boxCode) {
          setSelectedBoxForScan(null);
          setViewMode('dashboard');
        }
      }
      return;
    }

    const lotsInBox = manifestItems.filter((i: any) => i.boxCode === boxCode).length;
    const seriesInBox = scannedSeries.filter((s: any) => s.boxCode === boxCode).length;
    const message =
      lotsInBox > 0 || seriesInBox > 0
        ? `¿Eliminar ${boxCode}? Se quitarán ${lotsInBox} lote(s) y ${seriesInBox} equipo(s) escaneado(s).`
        : `¿Eliminar la caja vacía ${boxCode}?`;
    if (!(await confirmDialog({ title: 'Eliminar caja', message, tone: 'error', confirmText: 'Eliminar' }))) return;

    setManifestItems(manifestItems.filter((i: any) => i.boxCode !== boxCode));
    setScannedSeries(scannedSeries.filter((s: any) => s.boxCode !== boxCode));
    setClosedBoxes(closedBoxes.filter((b: string) => b !== boxCode));
    if (selectedBoxForScan === boxCode) {
      setSelectedBoxForScan(null);
      setViewMode('dashboard');
    }
  };

  const handleDeleteEquipment = async (item: { equipmentId?: string; sn: string; boxCode?: string }) => {
    const boxCode = item.boxCode || selectedBoxForScan;
    if (!boxCode) return;

    if (useIncrementalCapture && onDeleteEquipmentIncremental) {
      await onDeleteEquipmentIncremental(boxCode, item);
      return;
    }

    if (!(await confirmDialog({ title: 'Eliminar equipo', message: `¿Eliminar el equipo con serie ${item.sn}?`, tone: 'error', confirmText: 'Eliminar' }))) return;
    setScannedSeries(
      scannedSeries.filter((x: any) =>
        item.equipmentId ? x.equipmentId !== item.equipmentId : !(x.boxCode === boxCode && x.sn === item.sn)
      )
    );
  };

  const handleBackToDashboard = () => {
    if (selectedBoxForScan) {
      const stats = getPxBoxStats(selectedBoxForScan, manifestItems, scannedSeries);
      if (stats.isEmpty) {
        setSelectedBoxForScan(null);
      }
    }
    setViewMode('dashboard');
  };

  const handleCloseBox = async (boxCode: string) => {
    if (useIncrementalCapture && onCloseBoxIncremental) {
      const ok = await onCloseBoxIncremental(boxCode);
      if (ok) setViewMode('dashboard');
      return;
    }
    const check = canClosePxBox(boxCode, manifestItems, scannedSeries);
    if (!check.ok) {
      notify.warning(check.reason);
      return;
    }
    if (
      !(await confirmDialog({
        title: `Cerrar ${boxCode}`,
        message: 'Los datos quedan guardados en este navegador. No podrá editar la caja hasta reabrirla.',
        confirmText: 'Cerrar caja',
      }))
    ) {
      return;
    }
    setClosedBoxes([...new Set([...closedBoxes, boxCode])]);
    setViewMode('dashboard');
    setSelectedBoxForScan(null);
  };

  const handleReopenBox = async (boxCode: string) => {
    if (useIncrementalCapture && onReopenBoxIncremental) {
      await onReopenBoxIncremental(boxCode);
      return;
    }
    if (
      !(await confirmDialog({
        title: `Reabrir ${boxCode}`,
        message: 'Podrá volver a editar lotes y series. Debe cerrarla nuevamente antes de finalizar la recepción.',
        confirmText: 'Reabrir',
      }))
    ) {
      return;
    }
    setClosedBoxes(closedBoxes.filter((b: string) => b !== boxCode));
  };

  const handleAddLotToActiveBox = async () => {
    const targetBoxCode = selectedBoxForScan || `CAJA-${activeBoxNum}`;
    const meta = boxMetaByCode?.[targetBoxCode];
    const isClosed = useIncrementalCapture && meta
      ? meta.status === 'cerrada' || meta.status === 'closed'
      : closedBoxes.includes(targetBoxCode);
    if (isClosed) {
      notify.warning('Esta caja está cerrada. Reábrala para agregar lotes.');
      return;
    }
    if (useIncrementalCapture && onAddLotToBoxIncremental) {
      const ok = await onAddLotToBoxIncremental(targetBoxCode, currentEntry);
      if (ok) {
        setCurrentEntry({
          ...currentEntry,
          totalEsperado: 0,
        });
      }
      return;
    }
    if (!currentEntry.tecnologia || !currentEntry.marca || !currentEntry.modelo || !currentEntry.totalEsperado) {
      notify.warning("Complete tecnología, marca, modelo y cantidad esperada para este lote.");
      return;
    }

    setManifestItems([...manifestItems, {
      id: Math.random().toString(36).substr(2, 9),
      boxCode: targetBoxCode,
      ...currentEntry,
      material: ''
    }]);

    setSelectedBoxForScan(targetBoxCode);
    
    setCurrentEntry({
      ...currentEntry,
      totalEsperado: 0
    });
  };

  const boxesMap = new Map<string, any[]>();
  manifestItems.forEach((item: any) => {
    if (!boxesMap.has(item.boxCode)) {
      boxesMap.set(item.boxCode, []);
    }
    boxesMap.get(item.boxCode)!.push(item);
  });
  const activeBoxCodes = useIncrementalCapture && boxMetaByCode && Object.keys(boxMetaByCode).length > 0
    ? Object.keys(boxMetaByCode)
    : getPxActiveBoxCodes(manifestItems, scannedSeries);
  const boxLimitReached = useIncrementalCapture
    ? !canCreateNewPxBox(boxMetaByCode || {}, guideData.totalCajasEsperadas || 1).ok
    : false;
  const finalizeCheck =
    useIncrementalCapture && boxMetaByCode && Object.keys(boxMetaByCode).length > 0
      ? validatePxIncrementalFinalizeReadiness(boxMetaByCode, closedBoxes, scannedSeries)
      : validatePxFinalizeReadiness(manifestItems, scannedSeries, closedBoxes);
  const canFinalize = finalizeCheck.ok;
  const openBoxCount = activeBoxCodes.filter((b) => {
    if (useIncrementalCapture && boxMetaByCode?.[b]) {
      const st = boxMetaByCode[b].status;
      return st !== 'cerrada' && st !== 'closed';
    }
    return !closedBoxes.includes(b);
  }).length;
  const closedBoxCount = activeBoxCodes.filter((b) => {
    if (useIncrementalCapture && boxMetaByCode?.[b]) {
      const st = boxMetaByCode[b].status;
      return st === 'cerrada' || st === 'closed';
    }
    return closedBoxes.includes(b);
  }).length;

  const targetBox = selectedBoxForScan || '';
  const boxItems = boxesMap.get(targetBox) || [];
  const boxStats = getPxBoxStats(targetBox, manifestItems, scannedSeries);
  const boxMeta = useIncrementalCapture ? boxMetaByCode?.[targetBox] : null;
  const totalExpected = boxMeta?.declared_quantity ?? boxStats.totalExpected;
  const received = boxMeta?.captured_count ?? boxStats.received;
  const isBoxComplete = totalExpected > 0 && received >= totalExpected;
  const isBoxClosed = useIncrementalCapture && boxMeta
    ? boxMeta.status === 'cerrada' || boxMeta.status === 'closed'
    : closedBoxes.includes(targetBox);
  const progressPct = totalExpected > 0 ? Math.min(100, Math.round((received / totalExpected) * 100)) : 0;
  const hasBoxLock =
    !useIncrementalCapture ||
    !boxMeta ||
    (Boolean(boxMeta.locked_by) &&
      (!currentOperatorId || boxMeta.locked_by === currentOperatorId));
  const lockedByOtherOperator =
    useIncrementalCapture &&
    Boolean(boxMeta?.locked_by) &&
    Boolean(currentOperatorId) &&
    boxMeta!.locked_by !== currentOperatorId;
  const boxEditDisabled = isBoxClosed || lockedByOtherOperator;
  const canClose =
    useIncrementalCapture && received > 0
      ? !isBoxClosed
      : canClosePxBox(targetBox, manifestItems, scannedSeries).ok;

  const handleAdjustQuantityClick = async () => {
    if (!useIncrementalCapture || !onAdjustBoxQuantity || !boxMeta) return;
    const newQtyStr = await promptDialog({
      title: 'Ajustar cantidad de la caja',
      message: `Cantidad actual declarada: ${totalExpected} · Capturados: ${received}`,
      prompt: { defaultValue: String(totalExpected), placeholder: 'Nueva cantidad a recibir' },
    });
    if (!newQtyStr) return;
    const newQty = parseInt(newQtyStr, 10);
    if (!Number.isFinite(newQty) || newQty < 1) {
      notify.warning('Cantidad inválida.');
      return;
    }
    if (newQty < received) {
      notify.warning(`No puede ser menor a ${received} (ya capturados).`);
      return;
    }
    const reason = (await promptDialog({ title: 'Motivo del ajuste de cantidad', prompt: { required: true, multiline: true } }))?.trim();
    if (!reason) return;
    await onAdjustBoxQuantity(targetBox, newQty, reason);
  };

  return {
    viewMode, setViewMode, isEditingHeader,
    setIsEditingHeader, headerFieldErrors, setHeaderFieldErrors,
    isCheckingHeader, workInProgress, headerHasBlockingErrors,
    boxScannedSeries, scannedSerialUpperSet, boxSeriesPagination,
    activeBoxCodes, boxLimitReached, finalizeCheck,
    canFinalize, openBoxCount, closedBoxCount,
    targetBox, boxItems, boxMeta,
    totalExpected, received, isBoxClosed,
    progressPct, hasBoxLock, boxEditDisabled,
    canClose, checkHeaderFields, openHeaderEdit,
    saveHeaderEdit, cancelHeaderEdit, handleAbandonReception,
    handleStartReception, handleCreateNewBox, handleEnterBox,
    handleEditBox, handleDeleteBox, handleDeleteEquipment,
    handleBackToDashboard, handleCloseBox, handleReopenBox,
    handleAddLotToActiveBox, handleAdjustQuantityClick,
  };
}
