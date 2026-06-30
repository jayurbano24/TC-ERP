'use client';

import { useCallback, useEffect, useRef, useState, startTransition, type Dispatch, type SetStateAction } from 'react';
import type { CurrentEntry, GuideData } from '../types/reception.types';
import type { PxBoxSnapshot, PxLotInput } from '@/modules/recepcion/client/pxCapture';
import { snapshotToGuideData, snapshotToPxUiState, pxFingerprintFromSnapshot } from '@/modules/recepcion/client/pxCapture';
import { getWorkstationLabel } from '../utils/pxWorkstation';
import { validatePxIncrementalFinalizeReadiness } from '../utils/pxBoxUtils';
import { notify, confirmDialog, promptDialog } from '@/components/ui';
import {
  acquireBoxLockApi,
  appendPxCaptureLotsApi,
  closePxBoxApi,
  createPxBoxApi,
  fetchPxInProgressList,
  fetchPxReceptionSnapshot,
  fetchPxReceptionStamp,
  finalizePxReceptionApi,
  joinOrStartPxReceptionApi,
  reopenPxBoxApi,
  releaseBoxLockApi,
  voidPxEquipmentApi,
  deletePxCaptureBoxApi,
  scanPxEquipmentApi,
  type ScanPxEquipmentResult,
  setIncrementalReceptionIdInSession,
  getIncrementalReceptionIdFromSession,
  updatePxReceptionHeaderApi,
} from '../services/pxIncrementalApi';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

// Sondeo del snapshot PX. Se subió de 4s a 10s y se pausa cuando la pestaña no
// está visible para reducir egress de Supabase (descarga el snapshot completo en
// cada tick mientras hay una recepción abierta).
const POLL_MS = 10000;
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

function buildOptimisticScanResult(
  meta: PxBoxSnapshot | undefined,
  captured: number
): ScanPxEquipmentResult {
  return {
    success: true,
    equipmentId: `pending-${crypto.randomUUID()}`,
    capturedCount: captured + 1,
    declaredQuantity: meta?.declared_quantity ?? captured + 1,
    boxStatus: meta?.status ?? 'abierta',
  };
}

function buildScannedSerialSet(scannedSeries: any[]): Set<string> {
  const set = new Set<string>();
  for (const s of scannedSeries) {
    if (s.sn) set.add(String(s.sn).toUpperCase());
    if (s.s2) set.add(String(s.s2).toUpperCase());
    if (s.s3) set.add(String(s.s3).toUpperCase());
    if (s.s4) set.add(String(s.s4).toUpperCase());
  }
  return set;
}

function buildScanEntry(
  boxCode: string,
  currentScans: string[],
  validScans: string[],
  material: string | undefined,
  equipmentId: string
) {
  const upper = (v: string) => v.trim().toUpperCase();
  return {
    boxCode,
    sn: validScans[0],
    s2: currentScans[1]?.trim() ? upper(currentScans[1]) : undefined,
    s3: currentScans[2]?.trim() ? upper(currentScans[2]) : undefined,
    s4: currentScans[3]?.trim() ? upper(currentScans[3]) : undefined,
    material,
    equipmentId,
  };
}

function applyLocalScanPatch(
  pxState: PxStateSlice,
  setBoxMetaByCode: Dispatch<SetStateAction<Record<string, PxBoxSnapshot>>>,
  setBoxVersionByCode: Dispatch<SetStateAction<Record<string, number>>>,
  boxCode: string,
  scannedSeries: any[],
  currentScans: string[],
  validScans: string[],
  material: string | undefined,
  result: ScanPxEquipmentResult
): any[] {
  const nextSeries = [
    ...scannedSeries,
    buildScanEntry(boxCode, currentScans, validScans, material, result.equipmentId),
  ];
  pxState.setScannedSeries(nextSeries);
  setBoxMetaByCode((prev) => {
    const meta = prev[boxCode];
    if (!meta) return prev;
    return {
      ...prev,
      [boxCode]: {
        ...meta,
        captured_count: result.capturedCount,
        declared_quantity: result.declaredQuantity,
        status: result.boxStatus,
      },
    };
  });
  setBoxVersionByCode((prev) => ({
    ...prev,
    [boxCode]: (prev[boxCode] ?? 1) + 1,
  }));
  return nextSeries;
}

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
  const scannedSeriesRef = useRef<any[]>([]);
  const boxMetaRef = useRef<Record<string, PxBoxSnapshot>>({});
  // Última huella de sincronización aplicada. El sondeo compara contra esto para
  // decidir si descarga el snapshot completo (evita egress cuando nada cambió).
  const syncFingerprintRef = useRef<string | null>(null);

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
      scannedSeriesRef.current = ui.scannedSeries;
      setBoxMetaByCode(ui.boxMetaByCode);
      boxMetaRef.current = ui.boxMetaByCode;
      setBoxIdByCode(ui.boxIdByCode);
      setBoxVersionByCode(ui.boxVersionByCode);
      setReceptionVersion(snapshot.reception.version ?? 1);
      syncFingerprintRef.current = pxFingerprintFromSnapshot(snapshot);
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
      ?.auth.getUser()
      .then(({ data }) => {
        const id = data?.user?.id ?? null;
        operatorIdRef.current = id;
        setOperatorId(id);
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
      // No sondear si la pestaña está en segundo plano: evita egress innecesario
      // cuando el operador no está mirando la captura.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      // Sondeo incremental: primero pide solo la huella (bytes), y descarga el
      // snapshot completo SOLO si algo cambió respecto a lo ya aplicado.
      void (async () => {
        try {
          const stamp = await fetchPxReceptionStamp(incrementalReceptionId);
          if (syncFingerprintRef.current === null || stamp.fingerprint !== syncFingerprintRef.current) {
            await refreshSnapshot();
          }
        } catch {
          // Si falla la huella, intenta el snapshot completo como respaldo.
          await refreshSnapshot().catch(() => undefined);
        }
      })();
    }, POLL_MS);

    // Al volver a la pestaña, refresca una vez de inmediato (sin esperar al tick).
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshSnapshot().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVisible);
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
          notify.warning('Sesión de usuario no lista. Espere un momento o recargue la página.');
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
          const next = {
            ...prev,
            [boxCode]: {
              ...current,
              locked_by: result.locked_by ?? opId,
              lock_expires_at: result.lock_expires_at ?? current.lock_expires_at,
              version: result.version ?? current.version,
            },
          };
          boxMetaRef.current = { ...boxMetaRef.current, [boxCode]: next[boxCode] };
          return next;
        });
        if (result.version) {
          setBoxVersionByCode((prev) => ({ ...prev, [boxCode]: result.version! }));
        }
        return true;
      } catch (err: unknown) {
        notify.error(err instanceof Error ? err.message : 'No se pudo tomar control de la caja');
        return false;
      }
    },
    [currentUserFullName, ensureOperatorId]
  );

  const onAddLotToBoxIncremental = useCallback(
    async (boxCode: string, currentEntry: CurrentEntry) => {
      if (!incrementalReceptionId) {
        notify.warning('Inicie la recepción en servidor primero.');
        return false;
      }
      if (!currentEntry.tecnologia || !currentEntry.marca || !currentEntry.modelo || !currentEntry.totalEsperado) {
        notify.warning('Complete tecnología, marca, modelo y cantidad esperada.');
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
        notify.error(err instanceof Error ? err.message : 'Error al registrar lote en servidor');
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

      const { selectedBoxForScan, currentScans, manifestItems, scannedSeries, setCurrentScans } = pxState;
      const liveSeries =
        scannedSeriesRef.current.length > 0 ? scannedSeriesRef.current : scannedSeries;
      if (scannedSeriesRef.current !== liveSeries) {
        scannedSeriesRef.current = liveSeries;
      }

      if (!incrementalReceptionId) {
        notify.warning('Recepción no iniciada en servidor.');
        return;
      }
      if (!selectedBoxForScan) {
        notify.warning('Seleccione una caja primero.');
        return;
      }

      const boxId = boxIdByCode[selectedBoxForScan];
      if (!boxId) {
        notify.warning('La caja no está registrada en servidor. Agregue un lote primero.');
        return;
      }

      if (!currentScans[0]?.trim()) return;

      const opId = operatorIdRef.current ?? (await ensureOperatorId());
      if (!opId) {
        notify.warning('Sesión de usuario no lista. Espere un momento o recargue la página.');
        return;
      }

      const meta = boxMetaRef.current[selectedBoxForScan] ?? boxMetaByCode[selectedBoxForScan];
      const declared = meta?.declared_quantity ?? 0;
      const captured = meta?.captured_count ?? 0;
      if (declared > 0 && captured >= declared) {
        notify.warning(`La caja ${selectedBoxForScan} ya alcanzó su capacidad (${declared}).`);
        return;
      }

      const validScans = currentScans.map((s) => s?.trim().toUpperCase()).filter(Boolean);
      if (new Set(validScans).size !== validScans.length) {
        notify.warning('Ha ingresado series duplicadas en los campos de escaneo.');
        return;
      }

      const scannedSet = buildScannedSerialSet(liveSeries);
      const isDuplicateInScanned = validScans.some((v) => scannedSet.has(v));
      if (isDuplicateInScanned) {
        notify.warning('Una o más series ya fueron escaneadas en esta recepción.');
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
      const scanPayload = {
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
      };

      const optimisticResult = buildOptimisticScanResult(meta, captured);
      const pendingId = optimisticResult.equipmentId;
      const rollbackScans = [...currentScans];
      const rollbackMeta = meta ? { ...meta } : undefined;
      const rollbackVersion = boxVersionByCode[selectedBoxForScan];
      const seriesBeforePending = liveSeries;
      const nextSeries = [...liveSeries, buildScanEntry(
        selectedBoxForScan,
        currentScans,
        validScans,
        boxLot?.material,
        pendingId
      )];

      scannedSeriesRef.current = nextSeries;
      if (meta) {
        boxMetaRef.current = {
          ...boxMetaRef.current,
          [selectedBoxForScan]: {
            ...meta,
            captured_count: optimisticResult.capturedCount,
            declared_quantity: optimisticResult.declaredQuantity,
            status: optimisticResult.boxStatus,
          },
        };
      }

      startTransition(() => {
        pxState.setScannedSeries(nextSeries);
        setBoxMetaByCode((prev) => {
          const current = prev[selectedBoxForScan];
          if (!current) return prev;
          return {
            ...prev,
            [selectedBoxForScan]: {
              ...current,
              captured_count: optimisticResult.capturedCount,
              declared_quantity: optimisticResult.declaredQuantity,
              status: optimisticResult.boxStatus,
            },
          };
        });
        setBoxVersionByCode((prev) => ({
          ...prev,
          [selectedBoxForScan]: (prev[selectedBoxForScan] ?? 1) + 1,
        }));
        setCurrentScans(['', '', '', '']);
        setLastSyncedAt(new Date().toISOString());
      });
      setTimeout(() => document.getElementById('scan-input-0')?.focus(), 10);

      const rollbackOptimisticScan = () => {
        scannedSeriesRef.current = seriesBeforePending;
        if (rollbackMeta) {
          boxMetaRef.current = { ...boxMetaRef.current, [selectedBoxForScan]: rollbackMeta };
        }
        startTransition(() => {
          pxState.setScannedSeries(seriesBeforePending);
          setCurrentScans(rollbackScans);
          if (rollbackMeta) {
            setBoxMetaByCode((prev) => ({ ...prev, [selectedBoxForScan]: rollbackMeta }));
          }
          if (rollbackVersion !== undefined) {
            setBoxVersionByCode((prev) => ({ ...prev, [selectedBoxForScan]: rollbackVersion }));
          }
        });
      };

      const reconcileOptimisticScan = (result: ScanPxEquipmentResult) => {
        const reconciled = scannedSeriesRef.current.map((s) =>
          s.equipmentId === pendingId ? { ...s, equipmentId: result.equipmentId } : s
        );
        scannedSeriesRef.current = reconciled;
        if (meta) {
          boxMetaRef.current = {
            ...boxMetaRef.current,
            [selectedBoxForScan]: {
              ...(boxMetaRef.current[selectedBoxForScan] ?? meta),
              captured_count: result.capturedCount,
              declared_quantity: result.declaredQuantity,
              status: result.boxStatus,
            },
          };
        }
        startTransition(() => {
          pxState.setScannedSeries(reconciled);
          setBoxMetaByCode((prev) => {
            const current = prev[selectedBoxForScan];
            if (!current) return prev;
            return {
              ...prev,
              [selectedBoxForScan]: {
                ...current,
                captured_count: result.capturedCount,
                declared_quantity: result.declaredQuantity,
                status: result.boxStatus,
              },
            };
          });
        });
        window.setTimeout(() => {
          refreshSnapshot().catch(() => undefined);
        }, 2500);
      };

      const submitScan = async (retryOnLock = false): Promise<boolean> => {
        try {
          const result = await scanPxEquipmentApi(scanPayload);
          reconcileOptimisticScan(result);
          return true;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Error al guardar escaneo en servidor';
          if (!retryOnLock && message.includes('tomar control')) {
            const ok = await onAcquireBoxLock(selectedBoxForScan, boxId);
            if (ok) return submitScan(true);
          }
          rollbackOptimisticScan();
          notify.error(message);
          return false;
        }
      };

      void submitScan();
    },
    [
      pxState,
      incrementalReceptionId,
      boxIdByCode,
      boxMetaByCode,
      boxVersionByCode,
      systemBrands,
      systemModels,
      currentUserFullName,
      refreshSnapshot,
      onAcquireBoxLock,
      ensureOperatorId,
    ]
  );

  const onDeleteEquipmentIncremental = useCallback(
    async (boxCode: string, item: { equipmentId?: string; sn: string }) => {
      if (!incrementalReceptionId) {
        notify.warning('Recepción no iniciada en servidor.');
        return false;
      }
      if (!(await confirmDialog({ title: 'Eliminar equipo', message: `¿Eliminar el equipo con serie ${item.sn}?`, tone: 'error', confirmText: 'Eliminar' }))) return false;

      const boxId = boxIdByCode[boxCode];
      if (!boxId) {
        notify.warning('Caja no registrada en servidor.');
        return false;
      }

      const opId = operatorIdRef.current ?? (await ensureOperatorId());
      if (!opId) {
        notify.warning('Sesión de usuario no lista.');
        return false;
      }

      const meta = boxMetaRef.current[boxCode] ?? boxMetaByCode[boxCode];
      const lockHeldByMe =
        meta?.locked_by &&
        opId &&
        meta.locked_by === opId &&
        meta.lock_expires_at &&
        new Date(meta.lock_expires_at) > new Date();

      if (!lockHeldByMe) {
        const ok = await onAcquireBoxLock(boxCode, boxId);
        if (!ok) return false;
      }

      const prevSeries = scannedSeriesRef.current;
      const nextSeries = prevSeries.filter((s) => {
        if (item.equipmentId) return s.equipmentId !== item.equipmentId;
        return !(s.boxCode === boxCode && s.sn === item.sn);
      });
      scannedSeriesRef.current = nextSeries;
      startTransition(() => {
        pxState.setScannedSeries(nextSeries);
      });

      try {
        const isPending = item.equipmentId?.startsWith('pending-');
        const result = await voidPxEquipmentApi({
          receptionId: incrementalReceptionId,
          boxId,
          equipmentId: isPending ? null : item.equipmentId,
          mainSerial: item.sn,
          operatorId: opId,
          operatorName: currentUserFullName,
        });
        if (meta) {
          const updatedMeta = {
            ...meta,
            captured_count: result.capturedCount,
            declared_quantity: result.declaredQuantity,
            status: result.boxStatus,
            version: result.version,
          };
          boxMetaRef.current = { ...boxMetaRef.current, [boxCode]: updatedMeta };
          setBoxVersionByCode((prev) => ({ ...prev, [boxCode]: result.version }));
          startTransition(() => {
            setBoxMetaByCode((prev) => ({ ...prev, [boxCode]: updatedMeta }));
          });
        }
        return true;
      } catch (err: unknown) {
        scannedSeriesRef.current = prevSeries;
        startTransition(() => {
          pxState.setScannedSeries(prevSeries);
        });
        notify.error(err instanceof Error ? err.message : 'No se pudo eliminar el equipo');
        return false;
      }
    },
    [
      incrementalReceptionId,
      boxIdByCode,
      boxMetaByCode,
      currentUserFullName,
      onAcquireBoxLock,
      ensureOperatorId,
      pxState,
    ]
  );

  const onDeleteBoxIncremental = useCallback(
    async (boxCode: string) => {
      if (!incrementalReceptionId) {
        notify.warning('Recepción no iniciada en servidor.');
        return false;
      }

      const meta = boxMetaRef.current[boxCode] ?? boxMetaByCode[boxCode];
      const isClosed =
        meta?.status === 'cerrada' || meta?.status === 'closed' || pxState.closedBoxes.includes(boxCode);
      if (isClosed) {
        notify.warning('No puede eliminar una caja cerrada. Reábrala primero si necesita modificarla.');
        return false;
      }

      const lotsInBox = pxState.manifestItems.filter((i: any) => i.boxCode === boxCode).length;
      const seriesInBox = scannedSeriesRef.current.filter((s) => s.boxCode === boxCode).length;
      const message =
        lotsInBox > 0 || seriesInBox > 0
          ? `¿Eliminar ${boxCode}? Se quitarán ${lotsInBox} lote(s) y ${seriesInBox} equipo(s) escaneado(s).`
          : `¿Eliminar la caja vacía ${boxCode}?`;
      if (!(await confirmDialog({ title: 'Eliminar caja', message, tone: 'error', confirmText: 'Eliminar' }))) return false;

      const boxId = boxIdByCode[boxCode];
      if (!boxId) {
        notify.warning('Caja no registrada en servidor.');
        return false;
      }

      const opId = operatorIdRef.current ?? (await ensureOperatorId());
      if (!opId) {
        notify.warning('Sesión de usuario no lista.');
        return false;
      }

      const lockHeldByMe =
        meta?.locked_by &&
        opId &&
        meta.locked_by === opId &&
        meta.lock_expires_at &&
        new Date(meta.lock_expires_at) > new Date();

      if (!lockHeldByMe) {
        const ok = await onAcquireBoxLock(boxCode, boxId);
        if (!ok) return false;
      }

      try {
        await deletePxCaptureBoxApi({
          receptionId: incrementalReceptionId,
          boxId,
          expectedVersion: boxVersionByCode[boxCode] ?? meta?.version ?? 1,
          operatorId: opId,
          operatorName: currentUserFullName,
        });

        const nextSeries = scannedSeriesRef.current.filter((s) => s.boxCode !== boxCode);
        scannedSeriesRef.current = nextSeries;
        const nextManifest = pxState.manifestItems.filter((i: any) => i.boxCode !== boxCode);
        const { [boxCode]: _removedMeta, ...restMeta } = boxMetaRef.current;
        boxMetaRef.current = restMeta;

        startTransition(() => {
          pxState.setManifestItems(nextManifest);
          pxState.setScannedSeries(nextSeries);
          pxState.setClosedBoxes(pxState.closedBoxes.filter((b) => b !== boxCode));
          setBoxMetaByCode((prev) => {
            const { [boxCode]: _b, ...rest } = prev;
            return rest;
          });
          setBoxIdByCode((prev) => {
            const { [boxCode]: _b, ...rest } = prev;
            return rest;
          });
          setBoxVersionByCode((prev) => {
            const { [boxCode]: _b, ...rest } = prev;
            return rest;
          });
          if (pxState.selectedBoxForScan === boxCode) {
            pxState.setSelectedBoxForScan(null);
          }
        });
        return true;
      } catch (err: unknown) {
        notify.error(err instanceof Error ? err.message : 'No se pudo eliminar la caja');
        await refreshSnapshot();
        return false;
      }
    },
    [
      incrementalReceptionId,
      boxMetaByCode,
      boxIdByCode,
      boxVersionByCode,
      pxState,
      currentUserFullName,
      onAcquireBoxLock,
      ensureOperatorId,
      refreshSnapshot,
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
        partialReason = (await promptDialog({
          title: 'Cierre parcial de caja',
          message: `Caja incompleta (${captured}/${declared}). Indique el motivo:`,
          prompt: { required: true, multiline: true },
        }))?.trim();
        if (!partialReason) return false;
      } else if (!(await confirmDialog({ title: `Cerrar ${boxCode}`, message: `¿Cerrar ${boxCode}? (${captured}/${declared} equipos)`, confirmText: 'Cerrar caja' }))) {
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
        notify.error(err instanceof Error ? err.message : 'No se pudo cerrar la caja');
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
      if (!(await confirmDialog({ title: `Reabrir ${boxCode}`, message: `¿Reabrir ${boxCode}?`, confirmText: 'Reabrir' }))) return;

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
        notify.error(err instanceof Error ? err.message : 'No se pudo reabrir la caja');
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
      notify.error(err instanceof Error ? err.message : 'No se pudo guardar cabecera');
      return false;
    }
  }, [incrementalReceptionId, pxState.guideData, currentUserFullName, receptionVersion, applySnapshot]);

  const handleFinalizePXIncremental = useCallback(async () => {
    if (!incrementalReceptionId) {
      notify.warning('No hay recepción activa en servidor.');
      return;
    }

    const readiness = validatePxIncrementalFinalizeReadiness(
      boxMetaByCode,
      pxState.closedBoxes,
      pxState.scannedSeries
    );
    if (!readiness.ok) {
      notify.warning(readiness.reason);
      return;
    }

    const totalCaptured = readiness.totalCaptured;
    if (
      !(await confirmDialog({
        title: 'Finalizar recepción PX',
        message: `Se enviarán ${readiness.boxCodes.length} caja(s) con ${totalCaptured} equipos a Bodega Central. Los datos ya están en servidor; este paso los ingresa a inventario.`,
        confirmText: 'Finalizar',
      }))
    ) {
      return;
    }

    let varianceReason: string | undefined;
    const totalExpected = Object.values(boxMetaByCode).reduce(
      (acc, b) => acc + (b.declared_quantity ?? 0),
      0
    );
    if (totalCaptured < totalExpected) {
      varianceReason = (await promptDialog({
        title: 'Variación de cantidad',
        message: `Hay variación (${totalCaptured} capturados vs ${totalExpected} declarados). Indique el motivo:`,
        prompt: { required: true, multiline: true },
      }))?.trim();
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

      notify.success('Recepción PX finalizada', { description: 'Equipos ingresados a Bodega Central (cajas BOX-xxx).' });

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
      notify.error(err instanceof Error ? err.message : 'Error al finalizar recepción');
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
    onDeleteEquipmentIncremental,
    onDeleteBoxIncremental,
    handleFinalizePXIncremental,
    refreshSnapshot,
  };
}
