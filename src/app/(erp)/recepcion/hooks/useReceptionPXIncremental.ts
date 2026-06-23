'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CurrentEntry, GuideData } from '../types/reception.types';
import type { PxBoxSnapshot } from '@/lib/database/pxReceptionCapture';
import { snapshotToGuideData, snapshotToPxUiState } from '@/lib/database/pxReceptionCapture';
import { validationService } from '../services/validationService';
import { getWorkstationLabel } from '../utils/pxWorkstation';
import { validatePxIncrementalFinalizeReadiness } from '../utils/pxBoxUtils';
import {
  acquireBoxLockApi,
  appendPxCaptureLotsApi,
  closePxBoxApi,
  createPxBoxApi,
  fetchPxInProgressList,
  fetchPxReceptionSnapshot,
  finalizePxReceptionApi,
  joinOrStartPxReceptionApi,
  reopenPxBoxApi,
  releaseBoxLockApi,
  scanPxEquipmentApi,
  setIncrementalReceptionIdInSession,
  getIncrementalReceptionIdFromSession,
  updatePxReceptionHeaderApi,
  type PxLotInput,
} from '../services/pxIncrementalApi';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const POLL_MS = 4000;
const LEGACY_STORAGE_KEY = 'tc_erp_px_reception_state';

type PxStateSlice = {
  guideData: GuideData;
  setGuideData: (v: GuideData | ((prev: GuideData) => GuideData)) => void;
  manifestItems: any[];
  setManifestItems: (v: any[]) => void;
  scannedSeries: any[];
  setScannedSeries: (v: any[]) => void;
  closedBoxes: string[];
  setClosedBoxes: (v: string[]) => void;
  selectedBoxForScan: string | null;
  setSelectedBoxForScan: (v: string | null) => void;
  currentScans: string[];
  setCurrentScans: (v: string[]) => void;
  isReceptionStarted: boolean;
  setIsReceptionStarted: (v: boolean) => void;
  setPxRecords: (v: any[]) => void;
};

type UseReceptionPXIncrementalArgs = {
  pxState: PxStateSlice;
  currentUserFullName: string;
  systemBrands: any[];
  systemModels: any[];
  onHistoryRefresh?: () => Promise<void>;
};

function buildLotInput(
  entry: CurrentEntry,
  systemBrands: any[],
  systemModels: any[]
): PxLotInput {
  return {
    technologyName: entry.tecnologia,
    brandId: systemBrands.find((b) => b.name === entry.marca)?.id || null,
    modelId: systemModels.find((m) => m.name === entry.modelo)?.id || null,
    brandName: entry.marca,
    modelName: entry.modelo,
    expectedUnits: entry.totalEsperado,
    material: '',
  };
}

export function useReceptionPXIncremental({
  pxState,
  currentUserFullName,
  systemBrands,
  systemModels,
  onHistoryRefresh,
}: UseReceptionPXIncrementalArgs) {
  const [incrementalReceptionId, setIncrementalReceptionId] = useState<string | null>(null);
  const [receptionVersion, setReceptionVersion] = useState(1);
  const [boxMetaByCode, setBoxMetaByCode] = useState<Record<string, PxBoxSnapshot>>({});
  const [boxIdByCode, setBoxIdByCode] = useState<Record<string, string>>({});
  const [boxVersionByCode, setBoxVersionByCode] = useState<Record<string, number>>({});
  const [pxInProgressList, setPxInProgressList] = useState<any[]>([]);
  const [isLoadingIncrementalResume, setIsLoadingIncrementalResume] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const operatorIdRef = useRef<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  operatorIdRef.current = operatorId;

  const ensureOperatorId = useCallback(async (): Promise<string | null> => {
    if (operatorIdRef.current) return operatorIdRef.current;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    const id = data?.user?.id ?? null;
    if (id) {
      operatorIdRef.current = id;
      setOperatorId(id);
    }
    return id;
  }, []);

  const applySnapshot = useCallback(
    (snapshot: Awaited<ReturnType<typeof fetchPxReceptionSnapshot>>) => {
      if (!snapshot) return;
      const ui = snapshotToPxUiState(snapshot);
      pxState.setManifestItems(ui.manifestItems);
      pxState.setScannedSeries(ui.scannedSeries);
      pxState.setClosedBoxes(ui.closedBoxes);
      setBoxMetaByCode(ui.boxMetaByCode);
      setBoxIdByCode(ui.boxIdByCode);
      setBoxVersionByCode(ui.boxVersionByCode);
      setReceptionVersion(snapshot.reception.version ?? 1);
      pxState.setGuideData((prev) => ({
        ...prev,
        ...snapshotToGuideData(snapshot),
      }));
      setLastSyncedAt(new Date().toISOString());
    },
    [pxState]
  );

  const getFreshBoxVersion = useCallback(
    async (boxCode: string): Promise<number> => {
      if (!incrementalReceptionId) return 1;
      const snap = await fetchPxReceptionSnapshot(incrementalReceptionId);
      applySnapshot(snap);
      return snap.boxes.find((b) => b.box_code === boxCode)?.version ?? 1;
    },
    [incrementalReceptionId, applySnapshot]
  );

  const isVersionConflict = (err: unknown) =>
    err instanceof Error && err.message.includes('Conflicto de versión');

  const refreshSnapshot = useCallback(async () => {
    if (!incrementalReceptionId) return;
    const snap = await fetchPxReceptionSnapshot(incrementalReceptionId);
    applySnapshot(snap);
  }, [incrementalReceptionId, applySnapshot]);

  const loadInProgressList = useCallback(async () => {
    try {
      const list = await fetchPxInProgressList();
      setPxInProgressList(list);
    } catch {
      setPxInProgressList([]);
    }
  }, []);

  useEffect(() => {
    getSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => setOperatorId(data?.user?.id ?? null));
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

  useEffect(() => {
    const sessionId = getIncrementalReceptionIdFromSession();
    if (!sessionId) return;

    let cancelled = false;
    (async () => {
      setIsLoadingIncrementalResume(true);
      try {
        const snap = await fetchPxReceptionSnapshot(sessionId);
        if (cancelled || !snap) return;
        if (snap.reception.status !== 'EN_PROCESO') {
          setIncrementalReceptionIdInSession(null);
          return;
        }
        setIncrementalReceptionId(sessionId);
        applySnapshot(snap);
        pxState.setIsReceptionStarted(true);
      } catch {
        setIncrementalReceptionIdInSession(null);
      } finally {
        if (!cancelled) setIsLoadingIncrementalResume(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applySnapshot, pxState]);

  useEffect(() => {
    if (!pxState.isReceptionStarted || !incrementalReceptionId) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(() => {
      refreshSnapshot().catch(() => undefined);
    }, POLL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pxState.isReceptionStarted, incrementalReceptionId, refreshSnapshot]);

  const onStartReceptionIncremental = useCallback(async () => {
    const result = await joinOrStartPxReceptionApi({
      guideData: pxState.guideData,
      operatorName: currentUserFullName,
      operatorId,
      preferredGuideNumber: pxState.guideData.guia?.trim() || undefined,
    });
    setIncrementalReceptionId(result.receptionId);
    setIncrementalReceptionIdInSession(result.receptionId);
    pxState.setGuideData((prev) => ({ ...prev, guia: result.guideNumber }));
    pxState.setIsReceptionStarted(true);
    await refreshSnapshot();
    await loadInProgressList();
    return true;
  }, [pxState, currentUserFullName, operatorId, refreshSnapshot, loadInProgressList]);

  const onResumePxReception = useCallback(
    async (receptionId: string) => {
      setIsLoadingIncrementalResume(true);
      try {
        const snap = await fetchPxReceptionSnapshot(receptionId);
        if (!snap) throw new Error('Recepción no encontrada');
        setIncrementalReceptionId(receptionId);
        setIncrementalReceptionIdInSession(receptionId);
        applySnapshot(snap);
        pxState.setIsReceptionStarted(true);
      } finally {
        setIsLoadingIncrementalResume(false);
      }
    },
    [applySnapshot, pxState]
  );

  const onAcquireBoxLock = useCallback(
    async (boxCode: string, boxId: string) => {
      try {
        const opId = await ensureOperatorId();
        if (!opId) {
          alert('Sesión de usuario no lista. Espere un momento o recargue la página.');
          return false;
        }
        const result = await acquireBoxLockApi({
          boxId,
          operatorId: opId,
          operatorName: currentUserFullName,
        });
        setBoxMetaByCode((prev) => {
          const current = prev[boxCode];
          if (!current) return prev;
          return {
            ...prev,
            [boxCode]: {
              ...current,
              locked_by: result.locked_by ?? opId,
              lock_expires_at: result.lock_expires_at ?? current.lock_expires_at,
              version: result.version ?? current.version,
            },
          };
        });
        if (result.version) {
          setBoxVersionByCode((prev) => ({ ...prev, [boxCode]: result.version }));
        }
        await refreshSnapshot();
        return true;
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'No se pudo tomar control de la caja');
        return false;
      }
    },
    [currentUserFullName, ensureOperatorId, refreshSnapshot]
  );

  const onAddLotToBoxIncremental = useCallback(
    async (boxCode: string, currentEntry: CurrentEntry) => {
      if (!incrementalReceptionId) {
        alert('Inicie la recepción en servidor primero.');
        return false;
      }
      if (!currentEntry.tecnologia || !currentEntry.marca || !currentEntry.modelo || !currentEntry.totalEsperado) {
        alert('Complete tecnología, marca, modelo y cantidad esperada.');
        return false;
      }

      const lot = buildLotInput(currentEntry, systemBrands, systemModels);
      const existingBoxId = boxIdByCode[boxCode];

      try {
        let boxId = existingBoxId;
        if (!boxId) {
          const created = await createPxBoxApi(incrementalReceptionId, boxCode, [lot]);
          boxId = created.id;
        } else {
          await appendPxCaptureLotsApi(existingBoxId, [lot]);
        }
        await refreshSnapshot();
        pxState.setSelectedBoxForScan(boxCode);
        await onAcquireBoxLock(boxCode, boxId);
        return true;
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Error al registrar lote en servidor');
        return false;
      }
    },
    [
      incrementalReceptionId,
      boxIdByCode,
      systemBrands,
      systemModels,
      refreshSnapshot,
      pxState,
      onAcquireBoxLock,
    ]
  );

  const onScanPxIncremental = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isScanning) return;

      const { selectedBoxForScan, currentScans, manifestItems, scannedSeries, setCurrentScans } = pxState;

      if (!incrementalReceptionId) {
        alert('Recepción no iniciada en servidor.');
        return;
      }
      if (!selectedBoxForScan) {
        alert('Seleccione una caja primero.');
        return;
      }

      const boxId = boxIdByCode[selectedBoxForScan];
      if (!boxId) {
        alert('La caja no está registrada en servidor. Agregue un lote primero.');
        return;
      }

      if (!currentScans[0]?.trim()) return;

      const opId = await ensureOperatorId();
      if (!opId) {
        alert('Sesión de usuario no lista. Espere un momento o recargue la página.');
        return;
      }

      const meta = boxMetaByCode[selectedBoxForScan];
      const declared = meta?.declared_quantity ?? 0;
      const captured = meta?.captured_count ?? 0;
      if (declared > 0 && captured >= declared) {
        alert(`La caja ${selectedBoxForScan} ya alcanzó su capacidad (${declared}).`);
        return;
      }

      const validScans = currentScans.map((s) => s?.trim().toUpperCase()).filter(Boolean);
      if (new Set(validScans).size !== validScans.length) {
        alert('Ha ingresado series duplicadas en los campos de escaneo.');
        return;
      }

      const isDuplicateInScanned = scannedSeries.some(
        (s: any) =>
          validScans.includes(s.sn) ||
          validScans.includes(s.s2) ||
          validScans.includes(s.s3) ||
          validScans.includes(s.s4)
      );
      if (isDuplicateInScanned) {
        alert('Una o más series ya fueron escaneadas en esta recepción.');
        return;
      }

      const lockHeldByMe =
        meta?.locked_by &&
        opId &&
        meta.locked_by === opId &&
        meta.lock_expires_at &&
        new Date(meta.lock_expires_at) > new Date();

      if (!lockHeldByMe) {
        const ok = await onAcquireBoxLock(selectedBoxForScan, boxId);
        if (!ok) return;
      }

      const boxLot = manifestItems.find((i: any) => i.boxCode === selectedBoxForScan);

      try {
        for (const scan of validScans) {
          const validation = await validationService.checkSerialInSystem(scan);
          if (validation.blocked) {
            alert(validation.info);
            return;
          }
        }
      } catch (err: unknown) {
        alert('Error validando serie: ' + (err instanceof Error ? err.message : 'desconocido'));
        return;
      }

      setIsScanning(true);
      try {
        await scanPxEquipmentApi({
          receptionId: incrementalReceptionId,
          boxId,
          mainSerial: validScans[0],
          serialS2: currentScans[1]?.trim(),
          serialS3: currentScans[2]?.trim(),
          serialS4: currentScans[3]?.trim(),
          brandId: systemBrands.find((b) => b.name === boxLot?.marca)?.id || meta?.brand_id,
          modelId: systemModels.find((m) => m.name === boxLot?.modelo)?.id || meta?.model_id,
          material: boxLot?.material,
          operatorId: opId,
          operatorName: currentUserFullName,
          workstationLabel: getWorkstationLabel(),
        });

        await refreshSnapshot();
        setCurrentScans(['', '', '', '']);
        setTimeout(() => document.getElementById('scan-input-0')?.focus(), 10);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error al guardar escaneo en servidor';
        if (message.includes('tomar control')) {
          const ok = await onAcquireBoxLock(selectedBoxForScan, boxId);
          if (ok) {
            try {
              await scanPxEquipmentApi({
                receptionId: incrementalReceptionId,
                boxId,
                mainSerial: validScans[0],
                serialS2: currentScans[1]?.trim(),
                serialS3: currentScans[2]?.trim(),
                serialS4: currentScans[3]?.trim(),
                brandId: systemBrands.find((b) => b.name === boxLot?.marca)?.id || meta?.brand_id,
                modelId: systemModels.find((m) => m.name === boxLot?.modelo)?.id || meta?.model_id,
                material: boxLot?.material,
                operatorId: opId,
                operatorName: currentUserFullName,
                workstationLabel: getWorkstationLabel(),
              });
              await refreshSnapshot();
              setCurrentScans(['', '', '', '']);
              setTimeout(() => document.getElementById('scan-input-0')?.focus(), 10);
              return;
            } catch (retryErr: unknown) {
              alert(retryErr instanceof Error ? retryErr.message : message);
              return;
            }
          }
        }
        alert(message);
      } finally {
        setIsScanning(false);
      }
    },
    [
      isScanning,
      pxState,
      incrementalReceptionId,
      boxIdByCode,
      boxMetaByCode,
      systemBrands,
      systemModels,
      operatorId,
      currentUserFullName,
      refreshSnapshot,
      onAcquireBoxLock,
      ensureOperatorId,
    ]
  );

  const onCloseBoxIncremental = useCallback(
    async (boxCode: string) => {
      const meta = boxMetaByCode[boxCode];
      const boxId = boxIdByCode[boxCode];
      if (!meta || !boxId) return false;

      const captured = meta.captured_count ?? 0;
      const declared = meta.declared_quantity ?? 0;
      let partialReason: string | undefined;

      if (captured < declared) {
        partialReason = window.prompt(
          `Caja incompleta (${captured}/${declared}). Motivo de cierre parcial:`
        )?.trim();
        if (!partialReason) return false;
      } else if (!window.confirm(`¿Cerrar ${boxCode}? (${captured}/${declared} equipos)`)) {
        return false;
      }

      try {
        let expectedVersion = boxVersionByCode[boxCode] ?? meta.version ?? 1;
        try {
          await closePxBoxApi({
            boxId,
            expectedVersion,
            partialReason,
            operatorId: await ensureOperatorId(),
            operatorName: currentUserFullName,
          });
        } catch (err: unknown) {
          if (!isVersionConflict(err)) throw err;
          expectedVersion = await getFreshBoxVersion(boxCode);
          await closePxBoxApi({
            boxId,
            expectedVersion,
            partialReason,
            operatorId: await ensureOperatorId(),
            operatorName: currentUserFullName,
          });
        }
        try {
          await releaseBoxLockApi({ boxId, operatorId, reason: 'box_closed' });
        } catch {
          /* lock may already be cleared by RPC */
        }
        await refreshSnapshot();
        return true;
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'No se pudo cerrar la caja');
        return false;
      }
    },
    [boxMetaByCode, boxIdByCode, boxVersionByCode, operatorId, currentUserFullName, refreshSnapshot, ensureOperatorId, getFreshBoxVersion]
  );

  const onReopenBoxIncremental = useCallback(
    async (boxCode: string) => {
      const meta = boxMetaByCode[boxCode];
      const boxId = boxIdByCode[boxCode];
      if (!meta || !boxId) return;
      if (!window.confirm(`¿Reabrir ${boxCode}?`)) return;

      try {
        let expectedVersion = boxVersionByCode[boxCode] ?? meta.version ?? 1;
        try {
          await reopenPxBoxApi({
            boxId,
            expectedVersion,
            operatorId: await ensureOperatorId(),
            operatorName: currentUserFullName,
          });
        } catch (err: unknown) {
          if (!isVersionConflict(err)) throw err;
          expectedVersion = await getFreshBoxVersion(boxCode);
          await reopenPxBoxApi({
            boxId,
            expectedVersion,
            operatorId: await ensureOperatorId(),
            operatorName: currentUserFullName,
          });
        }
        await onAcquireBoxLock(boxCode, boxId);
        await refreshSnapshot();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'No se pudo reabrir la caja');
      }
    },
    [boxMetaByCode, boxIdByCode, boxVersionByCode, currentUserFullName, refreshSnapshot, onAcquireBoxLock, ensureOperatorId, getFreshBoxVersion]
  );

  const onAdjustBoxQuantity = useCallback(
    async (boxCode: string, newQty: number, reason: string) => {
      const boxId = boxIdByCode[boxCode];
      const meta = boxMetaByCode[boxCode];
      if (!boxId || !meta) return;
      const { adjustPxBoxQuantityApi } = await import('../services/pxIncrementalApi');
      let expectedVersion = boxVersionByCode[boxCode] ?? meta.version ?? 1;
      try {
        await adjustPxBoxQuantityApi({
          boxId,
          newDeclaredQuantity: newQty,
          reason,
          expectedVersion,
          operatorId: await ensureOperatorId(),
          operatorName: currentUserFullName,
        });
      } catch (err: unknown) {
        if (!isVersionConflict(err)) throw err;
        expectedVersion = await getFreshBoxVersion(boxCode);
        await adjustPxBoxQuantityApi({
          boxId,
          newDeclaredQuantity: newQty,
          reason,
          expectedVersion,
          operatorId: await ensureOperatorId(),
          operatorName: currentUserFullName,
        });
      }
      await refreshSnapshot();
    },
    [boxIdByCode, boxMetaByCode, boxVersionByCode, currentUserFullName, refreshSnapshot, ensureOperatorId, getFreshBoxVersion]
  );

  const onSaveHeaderIncremental = useCallback(async () => {
    if (!incrementalReceptionId) return false;
    try {
      const data = await updatePxReceptionHeaderApi({
        receptionId: incrementalReceptionId,
        guideData: pxState.guideData,
        operatorName: currentUserFullName,
        expectedVersion: receptionVersion,
      });
      applySnapshot(data);
      return true;
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'No se pudo guardar cabecera');
      return false;
    }
  }, [incrementalReceptionId, pxState.guideData, currentUserFullName, receptionVersion, applySnapshot]);

  const handleFinalizePXIncremental = useCallback(async () => {
    if (!incrementalReceptionId) {
      alert('No hay recepción activa en servidor.');
      return;
    }

    const readiness = validatePxIncrementalFinalizeReadiness(
      boxMetaByCode,
      pxState.closedBoxes,
      pxState.scannedSeries
    );
    if (!readiness.ok) {
      alert(readiness.reason);
      return;
    }

    const totalCaptured = readiness.totalCaptured;
    if (
      !window.confirm(
        `¿Finalizar recepción PX?\n\nSe enviarán ${readiness.boxCodes.length} caja(s) con ${totalCaptured} equipos a Bodega Central.\n\nLos datos ya están en servidor; este paso los ingresa a inventario.`
      )
    ) {
      return;
    }

    let varianceReason: string | undefined;
    const totalExpected = Object.values(boxMetaByCode).reduce(
      (acc, b) => acc + (b.declared_quantity ?? 0),
      0
    );
    if (totalCaptured < totalExpected) {
      varianceReason = window.prompt(
        `Hay variación (${totalCaptured} capturados vs ${totalExpected} declarados). Motivo:`
      )?.trim();
      if (!varianceReason) return;
    }

    try {
      await finalizePxReceptionApi({
        receptionId: incrementalReceptionId,
        expectedVersion: receptionVersion,
        varianceReason,
        operatorId,
        operatorName: currentUserFullName,
      });

      alert('Recepción PX finalizada. Equipos ingresados a Bodega Central (cajas BOX-xxx).');

      setIncrementalReceptionId(null);
      setIncrementalReceptionIdInSession(null);
      setBoxMetaByCode({});
      setBoxIdByCode({});
      pxState.setManifestItems([]);
      pxState.setScannedSeries([]);
      pxState.setClosedBoxes([]);
      pxState.setGuideData({
        sap: '',
        docReferencia: '',
        agencia: 'Monte Verdes',
        proveedorPx: '',
        guia: '',
        piloto: '',
        courier: '',
        totalCajasEsperadas: 1,
      });
      pxState.setIsReceptionStarted(false);

      try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        /* ignore */
      }

      await loadInProgressList();
      if (onHistoryRefresh) await onHistoryRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al finalizar recepción');
    }
  }, [
    incrementalReceptionId,
    boxMetaByCode,
    pxState,
    receptionVersion,
    operatorId,
    currentUserFullName,
    loadInProgressList,
    onHistoryRefresh,
  ]);

  return {
    useIncrementalCapture: true as const,
    incrementalReceptionId,
    boxMetaByCode,
    boxIdByCode,
    pxInProgressList,
    isLoadingIncrementalResume,
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
    handleFinalizePXIncremental,
    refreshSnapshot,
  };
}
