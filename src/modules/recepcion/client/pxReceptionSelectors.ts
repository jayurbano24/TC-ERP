import type { GuideData } from '@/app/(erp)/recepcion/types/reception.types';
import type { PxBoxSnapshot, PxReceptionSnapshot } from '@/modules/recepcion/client/pxCapture';
import {
  pxFingerprintFromSnapshot,
  snapshotToGuideData,
  snapshotToPxUiState,
} from '@/modules/recepcion/client/pxCapture';
import type { PxSnapshotCacheEntry } from './pxReceptionSession.types';

/** View-model operacional derivado del snapshot — selectors puros, sin side effects. */
export type PxReceptionOperationalViewModel = {
  manifestItems: ReturnType<typeof snapshotToPxUiState>['manifestItems'];
  scannedSeries: ReturnType<typeof snapshotToPxUiState>['scannedSeries'];
  closedBoxes: string[];
  boxIdByCode: Record<string, string>;
  boxVersionByCode: Record<string, number>;
  boxMetaByCode: Record<string, PxBoxSnapshot>;
  receptionVersion: number;
  guideDataPatch: Partial<GuideData>;
  fingerprint: string | null;
  includeEquipment: boolean;
};

const EMPTY_VM: PxReceptionOperationalViewModel = {
  manifestItems: [],
  scannedSeries: [],
  closedBoxes: [],
  boxIdByCode: {},
  boxVersionByCode: {},
  boxMetaByCode: {},
  receptionVersion: 1,
  guideDataPatch: {},
  fingerprint: null,
  includeEquipment: false,
};

export function selectOperationalViewModel(
  entry: PxSnapshotCacheEntry | null | undefined
): PxReceptionOperationalViewModel {
  if (!entry) return EMPTY_VM;

  const ui = snapshotToPxUiState(entry.snapshot, {
    hydrateScannedSeries: entry.includeEquipment,
  });

  return {
    manifestItems: ui.manifestItems,
    scannedSeries: ui.scannedSeries,
    closedBoxes: ui.closedBoxes,
    boxIdByCode: ui.boxIdByCode,
    boxVersionByCode: ui.boxVersionByCode,
    boxMetaByCode: ui.boxMetaByCode,
    receptionVersion: entry.snapshot.reception.version ?? 1,
    guideDataPatch: snapshotToGuideData(entry.snapshot),
    fingerprint: pxFingerprintFromSnapshot(entry.snapshot),
    includeEquipment: entry.includeEquipment,
  };
}

export function selectManifestItems(entry: PxSnapshotCacheEntry | null | undefined) {
  return selectOperationalViewModel(entry).manifestItems;
}

export function selectScannedSeries(
  entry: PxSnapshotCacheEntry | null | undefined,
  includeEquipment = entry?.includeEquipment ?? false
) {
  if (!entry) return [];
  return snapshotToPxUiState(entry.snapshot, { hydrateScannedSeries: includeEquipment }).scannedSeries;
}

export function selectBoxMetaByCode(entry: PxSnapshotCacheEntry | null | undefined) {
  return selectOperationalViewModel(entry).boxMetaByCode;
}

export function selectGuideDataPatch(entry: PxSnapshotCacheEntry | null | undefined): Partial<GuideData> {
  if (!entry) return {};
  return snapshotToGuideData(entry.snapshot);
}

export function selectReceptionVersion(entry: PxSnapshotCacheEntry | null | undefined): number {
  return entry?.snapshot.reception.version ?? 1;
}

export function patchSnapshotBox(
  snapshot: PxReceptionSnapshot,
  boxId: string,
  patch: Partial<Pick<PxBoxSnapshot, 'status' | 'version' | 'declared_quantity' | 'captured_count' | 'locked_by' | 'lock_expires_at'>>
): PxReceptionSnapshot {
  return {
    ...snapshot,
    boxes: snapshot.boxes.map((box) =>
      box.id === boxId
        ? {
            ...box,
            ...patch,
          }
        : box
    ),
  };
}
