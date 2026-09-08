import type { QueryClient } from '@tanstack/react-query';
import type {
  CurrentEntry,
  GuideData,
  PxManifestItem,
  PxScannedSeries,
} from '@/app/(erp)/recepcion/types/reception.types';
import type { PxBoxSnapshot, PxLotInput, PxReceptionSnapshot } from '@/modules/recepcion/client/pxCapture';
import type { PxSnapshotReason } from '@/modules/recepcion/client/pxReceptionSession.types';
import type { PxFinalizeProgress } from '@/app/(erp)/recepcion/services/pxIncrementalApi';

export type PxCatalogBrand = { id: string; name: string };
export type PxCatalogModel = {
  id: string;
  name: string;
  brand_id?: string;
  technology_id?: string;
};

export type PxSessionCommands = {
  start: (receptionId: string) => Promise<void>;
  switchReception: (receptionId: string) => Promise<boolean>;
  reconcile: (reason: PxSnapshotReason, includeEquipment?: boolean) => Promise<void>;
  ingestSnapshot: (snapshot: PxReceptionSnapshot, reason: PxSnapshotReason, includeEquipment: boolean) => void;
  scheduleSoftReconciliation: () => void;
  clearSession: () => void;
  refresh: (reason?: PxSnapshotReason) => Promise<void>;
};

export type PxOperationalMutators = {
  setScannedSeries: (value: PxScannedSeries[] | ((prev: PxScannedSeries[]) => PxScannedSeries[])) => void;
  setManifestItems: (value: PxManifestItem[] | ((prev: PxManifestItem[]) => PxManifestItem[])) => void;
  setClosedBoxes: (value: string[] | ((prev: string[]) => string[])) => void;
  setBoxMetaByCode: (
    updater: import('react').SetStateAction<Record<string, PxBoxSnapshot>>
  ) => void;
  setBoxVersionByCode: (updater: import('react').SetStateAction<Record<string, number>>) => void;
  setBoxIdByCode: (updater: import('react').SetStateAction<Record<string, string>>) => void;
  patchBoxMetaLocal: (boxCode: string, patch: Partial<PxBoxSnapshot>) => void;
};

export type PxBoxCommandContext = {
  queryClient: QueryClient;
  receptionId: string | null;
  operatorName: string;
  ensureOperatorId: () => Promise<string | null>;
  operatorId: string | null;
  guideData: GuideData;
  boxIdByCode: Record<string, string>;
  boxMetaByCode: Record<string, PxBoxSnapshot>;
  boxVersionByCode: Record<string, number>;
  manifestItems: PxManifestItem[];
  closedBoxes: string[];
  selectedBoxForScan: string | null;
  systemBrands: PxCatalogBrand[];
  systemModels: PxCatalogModel[];
  mutators: PxOperationalMutators;
  boxMetaRef: React.MutableRefObject<Record<string, PxBoxSnapshot>>;
  boxIdByCodeRef: React.MutableRefObject<Record<string, string>>;
  boxVersionByCodeRef: React.MutableRefObject<Record<string, number>>;
  scannedSeriesRef: React.MutableRefObject<PxScannedSeries[]>;
  setSelectedBoxForScan: (value: string | null) => void;
  session: Pick<PxSessionCommands, 'reconcile'>;
  getFreshBoxVersion: (boxCode: string) => Promise<number>;
  onAcquireBoxLock: (boxCode: string, boxId: string) => Promise<boolean>;
};

export type PxReceptionCommandContext = {
  guideData: GuideData;
  receptionVersion: number;
  operatorId: string | null;
  operatorName: string;
  receptionId: string | null;
  boxMetaByCode: Record<string, PxBoxSnapshot>;
  closedBoxes: string[];
  scannedSeries: PxScannedSeries[];
  session: PxSessionCommands;
  setGuideData: (value: GuideData | ((prev: GuideData) => GuideData)) => void;
  setIsReceptionStarted: (value: boolean) => void;
  loadInProgressList: () => Promise<void>;
  onHistoryRefresh?: () => Promise<void>;
  setFinalizeProgress: (value: PxFinalizeProgress | null) => void;
  resetOperationalState: () => void;
};

export type PxLotBuildInput = {
  entry: CurrentEntry;
  systemBrands: PxCatalogBrand[];
  systemModels: PxCatalogModel[];
};

export function buildLotInputFromEntry(input: PxLotBuildInput): PxLotInput {
  const { entry, systemBrands, systemModels } = input;
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

export function isPxVersionConflict(err: unknown): boolean {
  return err instanceof Error && err.message.includes('Conflicto de versión');
}
