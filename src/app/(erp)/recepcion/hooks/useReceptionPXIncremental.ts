'use client';

import { useCallback, useEffect, useRef, useState, startTransition, type Dispatch, type SetStateAction } from 'react';
import type { CurrentEntry, GuideData } from '../types/reception.types';
import type { PxBoxSnapshot, PxLotInput } from '@/modules/recepcion/client/pxCapture';
import { snapshotToGuideData, snapshotToPxUiState } from '@/modules/recepcion/client/pxCapture';
import { getWorkstationLabel } from '../utils/pxWorkstation';
import { getPxBoxesDefault } from '@/shared/constants/batchLimits';
import { canCreateNewPxBox, validatePxIncrementalFinalizeReadiness } from '../utils/pxBoxUtils';
import { notify, confirmDialog, promptDialog } from '@/components/ui';
import {
  previewEquipmentReentry,
  formatIngresoLabel,
} from '@/modules/recepcion/client/receptions';
import {
  acquireBoxLockApi,
  appendPxCaptureLotsApi,
  closePxBoxApi,
  createPxBoxApi,
  fetchPxInProgressList,
  fetchPxReceptionSnapshot,
  fetchPxBoxMeta,
  finalizePxReceptionApi,
  isPxReceptionResumable,
  type PxFinalizeProgress,
  joinOrStartPxReceptionApi,
  reopenPxBoxApi,
  releaseBoxLockApi,
  voidPxEquipmentApi,
  deletePxCaptureBoxApi,
  scanPxEquipmentApi,
  DuplicateOpenOsError,
  type ScanPxEquipmentResult,
  setIncrementalReceptionIdInSession,
  getIncrementalReceptionIdFromSession,
  updatePxReceptionHeaderApi,
} from '../services/pxIncrementalApi';
import { getCurrentReceptionActor } from '@/modules/recepcion/client/receptionActor';
import {
  resolveModelDigitRules,
  prepareScannedSerial,
  validateScanSlotsAgainstDigitRules,
} from '@/shared/validation/serialDigitRules';

// Soft-refresh tras ráfaga de pistoleos: 1 snapshot máximo cada 45s (antes: 1 por scan).
const SOFT_REFRESH_IDLE_MS = 45_000;

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
  const [finalizeProgress, setFinalizeProgress] = useState<PxFinalizeProgress | null>(null);
  const scannedSeriesRef = useRef<any[]>([]);
  const boxMetaRef = useRef<Record<string, PxBoxSnapshot>>({});
  const softRefreshTimerRef = useRef<number | null>(null);
  const boxIdByCodeRef = useRef<Record<string, string>>({});
  const boxVersionByCodeRef = useRef<Record<string, number>>({});

  operatorIdRef.current = operatorId;
  boxIdByCodeRef.current = boxIdByCode;
  boxVersionByCodeRef.current = boxVersionByCode;

  const ensureOperatorId = useCallback(async (): Promise<string | null> => {
    if (operatorIdRef.current) return operatorIdRef.current;
    const actor = await getCurrentReceptionActor();
    if (actor.userId) {
      operatorIdRef.current = actor.userId;
      setOperatorId(actor.userId);
    }
    return actor.userId;
  }, []);

  const applySnapshot = useCallback(
    (
      snapshot: Awaited<ReturnType<typeof fetchPxReceptionSnapshot>>,
      options?: { hydrateScannedSeries?: boolean }
    ) => {
      if (!snapshot) return;
      const hydrateScannedSeries =
        options?.hydrateScannedSeries ??
        snapshot.boxes.some((b) => (b.equipment?.length ?? 0) > 0);
      const ui = snapshotToPxUiState(snapshot, { hydrateScannedSeries });
      pxState.setManifestItems(ui.manifestItems);
      if (hydrateScannedSeries) {
        pxState.setScannedSeries(ui.scannedSeries);
        scannedSeriesRef.current = ui.scannedSeries;
      }
      pxState.setClosedBoxes(ui.closedBoxes);
      setBoxMetaByCode(ui.boxMetaByCode);
      boxMetaRef.current = ui.boxMetaByCode;
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

  const getFreshBoxVersion = useCallback(async (boxCode: string): Promise<number> => {
    const boxId = boxIdByCodeRef.current[boxCode];
    if (!boxId) return boxVersionByCodeRef.current[boxCode] ?? 1;
    const meta = await fetchPxBoxMeta(boxId);
    setBoxVersionByCode((prev) => ({ ...prev, [boxCode]: meta.version }));
    setBoxMetaByCode((prev) => {
      const current = prev[boxCode];
      const next = {
        ...(current || {
          id: meta.id,
          box_code: meta.box_code,
          brand_id: null,
          model_id: null,
          lots: [],
          equipment: [],
        }),
        id: meta.id,
        box_code: meta.box_code,
        status: meta.status,
        declared_quantity: meta.declared_quantity,
        captured_count: meta.captured_count,
        version: meta.version,
        locked_by: meta.locked_by,
        lock_expires_at: meta.lock_expires_at,
      } as PxBoxSnapshot;
      boxMetaRef.current = { ...boxMetaRef.current, [boxCode]: next };
      return { ...prev, [boxCode]: next };
    });
    return meta.version;
  }, []);

  const isVersionConflict = (err: unknown) =>
    err instanceof Error && err.message.includes('Conflicto de versión');

  const refreshSnapshot = useCallback(async () => {
    if (!incrementalReceptionId) return;
    const snap = await fetchPxReceptionSnapshot(incrementalReceptionId, { includeEquipment: false });
    applySnapshot(snap, { hydrateScannedSeries: false });
  }, [incrementalReceptionId, applySnapshot]);

  /** Coalesce: muchos pistoleos → un solo GET snapshot tras idle. */
  const scheduleSoftRefresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (softRefreshTimerRef.current) window.clearTimeout(softRefreshTimerRef.current);
    softRefreshTimerRef.current = window.setTimeout(() => {
      softRefreshTimerRef.current = null;
      refreshSnapshot().catch(() => undefined);
    }, SOFT_REFRESH_IDLE_MS);
  }, [refreshSnapshot]);

  useEffect(() => {
    return () => {
      if (softRefreshTimerRef.current) window.clearTimeout(softRefreshTimerRef.current);
    };
  }, []);

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

  useEffect(() => {
    const sessionId = getIncrementalReceptionIdFromSession();
    if (!sessionId) return;

    let cancelled = false;
    (async () => {
      setIsLoadingIncrementalResume(true);
      try {
        const snap = await fetchPxReceptionSnapshot(sessionId, { includeEquipment: true });
        if (cancelled || !snap) return;
        if (!isPxReceptionResumable(snap.reception.status)) {
          setIncrementalReceptionIdInSession(null);
          return;
        }
        setIncrementalReceptionId(sessionId);
        applySnapshot(snap, { hydrateScannedSeries: true });
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
        const snap = await fetchPxReceptionSnapshot(receptionId, { includeEquipment: true });
        if (!snap) throw new Error('Recepción no encontrada');
        setIncrementalReceptionId(receptionId);
        setIncrementalReceptionIdInSession(receptionId);
        applySnapshot(snap, { hydrateScannedSeries: true });
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
        // El servidor puede reasignar el correlativo si el propuesto ya fue usado
        // por una caja eliminada; manda el código que quedó persistido.
        let effectiveBoxCode = boxCode;
        if (!boxId) {
          const limitCheck = canCreateNewPxBox(
            boxMetaRef.current,
            pxState.guideData.totalCajasEsperadas ?? getPxBoxesDefault()
          );
          if (!limitCheck.ok) {
            notify.warning(limitCheck.reason);
            return false;
          }
          const created = await createPxBoxApi(incrementalReceptionId, boxCode, [lot]);
          boxId = created.id;
          effectiveBoxCode = created.box_code || boxCode;
        } else {
          await appendPxCaptureLotsApi(existingBoxId, [lot]);
        }
        await refreshSnapshot();
        pxState.setSelectedBoxForScan(effectiveBoxCode);
        await onAcquireBoxLock(effectiveBoxCode, boxId);
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

      const boxLot = manifestItems.find((i: any) => i.boxCode === selectedBoxForScan);
      const model =
        systemModels.find((m: any) => m.name === boxLot?.modelo) ||
        systemModels.find((m: any) => m.id === (boxMetaByCode[selectedBoxForScan]?.model_id));
      const digitRules = resolveModelDigitRules(model);
      const digitCheck = validateScanSlotsAgainstDigitRules(currentScans, digitRules);
      if (!digitCheck.ok) {
        notify.warning(digitCheck.message, {
          description: digitCheck.description,
        });
        return;
      }

      const opId = operatorIdRef.current ?? (await ensureOperatorId());
      if (!opId) {
        notify.warning('Sesión de usuario no lista. Espere un momento o recargue la página.');
        return;
      }

      const meta = boxMetaRef.current[selectedBoxForScan] ?? boxMetaByCode[selectedBoxForScan];
      const declared = meta?.declared_quantity ?? 0;
      const captured = meta?.captured_count ?? 0;
      if (declared > 0 && captured >= declared) {
        notify.warning(`Caja ${selectedBoxForScan} llena: ${captured}/${declared} equipos.`, {
          description: 'No se permiten más equipos. Cierre esta caja y continúe en la siguiente.',
          duration: 8000,
        });
        return;
      }

      const validScans = currentScans.map((s) => prepareScannedSerial(s)).filter(Boolean);
      if (new Set(validScans).size !== validScans.length) {
        notify.warning('Duplicado en el mismo equipo', {
          description:
            'Las series S1–S4 no pueden repetirse en un mismo escaneo. Corrija la grilla e intente de nuevo.',
        });
        return;
      }

      const scannedSet = buildScannedSerialSet(liveSeries);
      const isDuplicateInScanned = validScans.some((v) => scannedSet.has(v));
      if (isDuplicateInScanned) {
        notify.warning('Duplicado en el mismo lote', {
          description:
            'Una o más series ya fueron capturadas en esta recepción o caja PX. Quite el duplicado de la grilla.',
        });
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
        scheduleSoftRefresh();
      };

      const attachReentryPreview = async (equipmentId: string) => {
        try {
          const serials = [
            scanPayload.mainSerial,
            scanPayload.serialS2,
            scanPayload.serialS3,
            scanPayload.serialS4,
          ].filter(Boolean) as string[];
          const count = await previewEquipmentReentry(serials);
          if (count <= 1) return;
          const patched = scannedSeriesRef.current.map((s) =>
            s.equipmentId === equipmentId || s.equipmentId === pendingId
              ? { ...s, reentryCount: count }
              : s
          );
          scannedSeriesRef.current = patched;
          startTransition(() => pxState.setScannedSeries(patched));
          notify.info(`${formatIngresoLabel(count)} detectado (PX)`, {
            description: `La serie ${serials[0]} ya estuvo en el sistema y vuelve a ingresar.`,
          });
        } catch {
          /* preview opcional */
        }
      };

      const submitScan = async (retryOnLock = false): Promise<boolean> => {
        try {
          const result = await scanPxEquipmentApi(scanPayload);
          reconcileOptimisticScan(result);
          void attachReentryPreview(result.equipmentId);
          if (
            result.declaredQuantity > 0 &&
            result.capturedCount >= result.declaredQuantity
          ) {
            notify.success(`Caja ${selectedBoxForScan} completada`, {
              description: `${result.capturedCount}/${result.declaredQuantity} equipos. El escáner quedó bloqueado; cierre la caja para continuar.`,
              duration: 10000,
            });
          }
          return true;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Error al guardar escaneo en servidor';
          if (!retryOnLock && message.includes('tomar control')) {
            const ok = await onAcquireBoxLock(selectedBoxForScan, boxId);
            if (ok) return submitScan(true);
          }
          rollbackOptimisticScan();
          if (err instanceof DuplicateOpenOsError) {
            const duplicate = err.details;
            await refreshSnapshot();
            notify.error('SERIE DUPLICADA – ORDEN DE SERVICIO ABIERTA', {
              description:
                `La serie ${duplicate.serial} ya está registrada en otra OS abierta. ` +
                `OS: ${duplicate.existing_os_number || 'sin número'} · ` +
                `Estado: ${duplicate.existing_os_status || 'sin estado'}. ` +
                'Esta unidad NO fue ingresada ni contabilizada. Resuelva la OS existente antes de reintentar.',
              duration: 15000,
            });
          } else if (message.includes('caja alcanzó su capacidad') || message.includes('BOX_FULL')) {
            await refreshSnapshot();
            notify.warning(`Caja ${selectedBoxForScan} llena`, {
              description:
                'El equipo no fue registrado. Cierre esta caja y seleccione o cree la siguiente.',
              duration: 10000,
            });
          } else {
            notify.error(message);
          }
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
      scheduleSoftRefresh,
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
      setFinalizeProgress({
        phase: 'prep',
        prepDone: 0,
        prepTotal: readiness.boxCodes.length,
        promoteDone: 0,
        promoteTotal: totalCaptured,
        label: 'Iniciando…',
      });

      setFinalizeProgress({
        phase: 'promote',
        prepDone: readiness.boxCodes.length,
        prepTotal: readiness.boxCodes.length,
        promoteDone: 0,
        promoteTotal: totalCaptured,
        label: 'Servidor procesando cajas y equipos de forma persistente…',
      });

      const result = await finalizePxReceptionApi({
        receptionId: incrementalReceptionId,
        expectedVersion: receptionVersion,
        varianceReason,
        operatorId,
        operatorName: currentUserFullName,
      });

      const batchDesc =
        result.batches && (result.batches.prep > 0 || result.batches.promote > 0)
          ? ` (${result.batches.prep} prep + ${result.batches.promote} lotes)`
          : '';

      notify.success(
        result.already_finalized ? 'Recepción ya estaba finalizada' : 'Recepción PX finalizada',
        { description: `Equipos en Bodega Central${batchDesc}.` },
      );

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
        totalCajasEsperadas: getPxBoxesDefault(),
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
    } finally {
      setFinalizeProgress(null);
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
    finalizeProgress,
    refreshSnapshot,
  };
}
