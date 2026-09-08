'use client';

import { useCallback, useMemo, useRef, useState, type SetStateAction } from 'react';
import type { GuideData, PxManifestItem, PxScannedSeries } from '@/app/(erp)/recepcion/types/reception.types';
import type { PxBoxSnapshot } from '@/modules/recepcion/client/pxCapture';
import type { PxSnapshotCacheEntry } from '@/modules/recepcion/client/pxReceptionSession.types';
import { selectOperationalViewModel } from '@/modules/recepcion/client/pxReceptionSelectors';
import { mergeScannedSeriesWithOverlay } from '@/modules/recepcion/client/pxReceptionViewModel';
import type { PxOperationalMutators } from '@/modules/recepcion/application/px/pxCommandTypes';

type OperationalOverride = {
  forFingerprint: string;
  manifestItems?: PxManifestItem[];
  scannedSeries?: PxScannedSeries[];
  closedBoxes?: string[];
  boxMetaByCode?: Record<string, PxBoxSnapshot>;
  boxIdByCode?: Record<string, string>;
  boxVersionByCode?: Record<string, number>;
};

export type UsePxOperationalStateArgs = {
  snapshotEntry: PxSnapshotCacheEntry | null | undefined;
  uiGuideData: GuideData;
  isReceptionStarted: boolean;
};

export type PxOperationalState = {
  guideData: GuideData;
  manifestItems: PxManifestItem[];
  scannedSeries: PxScannedSeries[];
  closedBoxes: string[];
  boxMetaByCode: Record<string, PxBoxSnapshot>;
  boxIdByCode: Record<string, string>;
  boxVersionByCode: Record<string, number>;
  receptionVersion: number;
  mutators: PxOperationalMutators;
  scannedSeriesRef: React.MutableRefObject<PxScannedSeries[]>;
  boxMetaRef: React.MutableRefObject<Record<string, PxBoxSnapshot>>;
  boxIdByCodeRef: React.MutableRefObject<Record<string, string>>;
  boxVersionByCodeRef: React.MutableRefObject<Record<string, number>>;
  resetOperationalState: () => void;
};

export function usePxOperationalState({
  snapshotEntry,
  uiGuideData,
  isReceptionStarted,
}: UsePxOperationalStateArgs): PxOperationalState {
  const serverVm = useMemo(
    () => selectOperationalViewModel(snapshotEntry),
    [snapshotEntry]
  );

  const [scanOverlay, setScanOverlay] = useState<PxScannedSeries[]>([]);
  const [operationalOverride, setOperationalOverride] = useState<OperationalOverride | null>(null);

  const activeOverride = useMemo(() => {
    if (!serverVm.fingerprint || !operationalOverride) return null;
    if (operationalOverride.forFingerprint !== serverVm.fingerprint) return null;
    return operationalOverride;
  }, [operationalOverride, serverVm.fingerprint]);

  const guideData = useMemo<GuideData>(() => {
    if (!isReceptionStarted || !serverVm.guideDataPatch.guia) return uiGuideData;
    return { ...uiGuideData, ...serverVm.guideDataPatch };
  }, [isReceptionStarted, serverVm.guideDataPatch, uiGuideData]);

  const manifestItems = activeOverride?.manifestItems ?? serverVm.manifestItems;
  const closedBoxes = activeOverride?.closedBoxes ?? serverVm.closedBoxes;
  const boxMetaByCode = activeOverride?.boxMetaByCode ?? serverVm.boxMetaByCode;
  const boxIdByCode = activeOverride?.boxIdByCode ?? serverVm.boxIdByCode;
  const boxVersionByCode = activeOverride?.boxVersionByCode ?? serverVm.boxVersionByCode;
  const receptionVersion = serverVm.receptionVersion;

  const scannedSeries = useMemo(
    () =>
      activeOverride?.scannedSeries ??
      mergeScannedSeriesWithOverlay(serverVm.scannedSeries, scanOverlay),
    [activeOverride?.scannedSeries, serverVm.scannedSeries, scanOverlay]
  );

  const scannedSeriesRef = useRef<PxScannedSeries[]>([]);
  const boxMetaRef = useRef<Record<string, PxBoxSnapshot>>({});
  const boxIdByCodeRef = useRef<Record<string, string>>({});
  const boxVersionByCodeRef = useRef<Record<string, number>>({});

  boxMetaRef.current = boxMetaByCode;
  boxIdByCodeRef.current = boxIdByCode;
  boxVersionByCodeRef.current = boxVersionByCode;
  scannedSeriesRef.current = scannedSeries;

  const patchBoxMetaLocal = useCallback(
    (boxCode: string, patch: Partial<PxBoxSnapshot>) => {
      setOperationalOverride((prev) => {
        const fp = serverVm.fingerprint ?? 'local';
        const baseMeta = prev?.forFingerprint === fp ? prev.boxMetaByCode ?? boxMetaByCode : boxMetaByCode;
        const current = baseMeta[boxCode];
        if (!current) return prev;
        const nextMeta = { ...baseMeta, [boxCode]: { ...current, ...patch } };
        boxMetaRef.current = nextMeta;
        return {
          ...(prev?.forFingerprint === fp ? prev : {}),
          forFingerprint: fp,
          boxMetaByCode: nextMeta,
          boxVersionByCode: {
            ...(prev?.boxVersionByCode ?? boxVersionByCode),
            [boxCode]: patch.version ?? baseMeta[boxCode]?.version ?? 1,
          },
        };
      });
    },
    [boxMetaByCode, boxVersionByCode, serverVm.fingerprint]
  );

  const setManifestItems = useCallback(
    (value: PxManifestItem[] | ((prev: PxManifestItem[]) => PxManifestItem[])) => {
      setOperationalOverride((prev) => {
        const fp = serverVm.fingerprint ?? 'local';
        const base = prev?.forFingerprint === fp ? prev.manifestItems ?? manifestItems : manifestItems;
        const next = typeof value === 'function' ? value(base) : value;
        return { forFingerprint: fp, manifestItems: next };
      });
    },
    [manifestItems, serverVm.fingerprint]
  );

  const setScannedSeries = useCallback(
    (value: PxScannedSeries[] | ((prev: PxScannedSeries[]) => PxScannedSeries[])) => {
      if (typeof value === 'function') {
        setScanOverlay((prev) => value(mergeScannedSeriesWithOverlay(serverVm.scannedSeries, prev)));
      } else {
        setScanOverlay(value);
      }
    },
    [serverVm.scannedSeries]
  );

  const setClosedBoxes = useCallback(
    (value: string[] | ((prev: string[]) => string[])) => {
      setOperationalOverride((prev) => {
        const fp = serverVm.fingerprint ?? 'local';
        const base = prev?.forFingerprint === fp ? prev.closedBoxes ?? closedBoxes : closedBoxes;
        const next = typeof value === 'function' ? value(base) : value;
        return { ...(prev?.forFingerprint === fp ? prev : {}), forFingerprint: fp, closedBoxes: next };
      });
    },
    [closedBoxes, serverVm.fingerprint]
  );

  const setBoxMetaByCode = useCallback(
    (updater: SetStateAction<Record<string, PxBoxSnapshot>>) => {
      setOperationalOverride((prev) => {
        const fp = serverVm.fingerprint ?? 'local';
        const base = prev?.forFingerprint === fp ? prev.boxMetaByCode ?? boxMetaByCode : boxMetaByCode;
        const next = typeof updater === 'function' ? updater(base) : updater;
        boxMetaRef.current = next;
        return { ...(prev?.forFingerprint === fp ? prev : {}), forFingerprint: fp, boxMetaByCode: next };
      });
    },
    [boxMetaByCode, serverVm.fingerprint]
  );

  const setBoxVersionByCode = useCallback(
    (updater: SetStateAction<Record<string, number>>) => {
      setOperationalOverride((prev) => {
        const fp = serverVm.fingerprint ?? 'local';
        const base = prev?.forFingerprint === fp ? prev.boxVersionByCode ?? boxVersionByCode : boxVersionByCode;
        const next = typeof updater === 'function' ? updater(base) : updater;
        return { ...(prev?.forFingerprint === fp ? prev : {}), forFingerprint: fp, boxVersionByCode: next };
      });
    },
    [boxVersionByCode, serverVm.fingerprint]
  );

  const setBoxIdByCode = useCallback(
    (updater: SetStateAction<Record<string, string>>) => {
      setOperationalOverride((prev) => {
        const fp = serverVm.fingerprint ?? 'local';
        const base = prev?.forFingerprint === fp ? prev.boxIdByCode ?? boxIdByCode : boxIdByCode;
        const next = typeof updater === 'function' ? updater(base) : updater;
        return { ...(prev?.forFingerprint === fp ? prev : {}), forFingerprint: fp, boxIdByCode: next };
      });
    },
    [boxIdByCode, serverVm.fingerprint]
  );

  const resetOperationalState = useCallback(() => {
    setScanOverlay([]);
    setOperationalOverride(null);
    setBoxMetaByCode({});
    setBoxIdByCode({});
    setManifestItems([]);
    setScannedSeries([]);
    setClosedBoxes([]);
  }, [setBoxMetaByCode, setBoxIdByCode, setManifestItems, setScannedSeries, setClosedBoxes]);

  const mutators: PxOperationalMutators = useMemo(
    () => ({
      setScannedSeries,
      setManifestItems,
      setClosedBoxes,
      setBoxMetaByCode,
      setBoxVersionByCode,
      setBoxIdByCode,
      patchBoxMetaLocal,
    }),
    [
      setScannedSeries,
      setManifestItems,
      setClosedBoxes,
      setBoxMetaByCode,
      setBoxVersionByCode,
      setBoxIdByCode,
      patchBoxMetaLocal,
    ]
  );

  return {
    guideData,
    manifestItems,
    scannedSeries,
    closedBoxes,
    boxMetaByCode,
    boxIdByCode,
    boxVersionByCode,
    receptionVersion,
    mutators,
    scannedSeriesRef,
    boxMetaRef,
    boxIdByCodeRef,
    boxVersionByCodeRef,
    resetOperationalState,
  };
}
