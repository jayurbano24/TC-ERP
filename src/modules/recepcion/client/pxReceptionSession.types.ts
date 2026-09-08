import type { PxReceptionSnapshot } from '@/modules/recepcion/client/pxCapture';

/** Razón explícita de cada GET snapshot — solo cliente; no viaja al backend. */
export type PxSnapshotReason =
  | 'RESUME'
  | 'START'
  | 'MUTATION_RECONCILIATION'
  | 'EXPLICIT_REFRESH'
  | 'ERROR_RECONCILIATION'
  | 'SOFT_REFRESH';

export type PxSnapshotCacheEntry = {
  snapshot: PxReceptionSnapshot;
  reason: PxSnapshotReason;
  includeEquipment: boolean;
  fetchedAt: number;
};

export type PxSnapshotMetricEvent = {
  event: 'px_snapshot_fetch';
  receptionId: string;
  reason: PxSnapshotReason;
  durationMs: number;
  success: boolean;
  version?: number;
  includeEquipment: boolean;
};

export type PxSnapshotFetchParams = {
  reason: PxSnapshotReason;
  includeEquipment?: boolean;
  signal?: AbortSignal;
};

export type PxReceptionSessionState = {
  receptionId: string | null;
  snapshotEntry: PxSnapshotCacheEntry | null;
  isLoadingResume: boolean;
  appliedVersion: number;
};
