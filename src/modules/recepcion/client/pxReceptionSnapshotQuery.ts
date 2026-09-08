import type { PxReceptionSnapshot } from '@/modules/recepcion/client/pxCapture';
import { fetchPxReceptionSnapshot } from '@/app/(erp)/recepcion/services/pxIncrementalApi';
import { recordPxSnapshotFetch } from './pxReceptionSessionMetrics';
import type { PxSnapshotCacheEntry, PxSnapshotFetchParams } from './pxReceptionSession.types';

export const PX_RECEPTION_QUERY_SCOPE = 'px-reception' as const;

export function pxReceptionQueryKey(receptionId: string): readonly [typeof PX_RECEPTION_QUERY_SCOPE, string] {
  return [PX_RECEPTION_QUERY_SCOPE, receptionId] as const;
}

export function defaultIncludeEquipmentForReason(reason: PxSnapshotFetchParams['reason']): boolean {
  return reason === 'RESUME';
}

export function buildSnapshotDedupeKey(
  receptionId: string,
  reason: PxSnapshotFetchParams['reason'],
  includeEquipment: boolean
): string {
  return `${receptionId}:${reason}:${includeEquipment ? '1' : '0'}`;
}

export async function fetchPxSnapshotForSession(
  receptionId: string,
  params: PxSnapshotFetchParams
): Promise<PxSnapshotCacheEntry> {
  const includeEquipment = params.includeEquipment ?? defaultIncludeEquipmentForReason(params.reason);
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    const snapshot: PxReceptionSnapshot = await fetchPxReceptionSnapshot(receptionId, {
      includeEquipment,
      signal: params.signal,
    });

    recordPxSnapshotFetch({
      event: 'px_snapshot_fetch',
      receptionId,
      reason: params.reason,
      durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started,
      success: true,
      version: snapshot.reception.version,
      includeEquipment,
    });

    return {
      snapshot,
      reason: params.reason,
      includeEquipment,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    recordPxSnapshotFetch({
      event: 'px_snapshot_fetch',
      receptionId,
      reason: params.reason,
      durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started,
      success: false,
      includeEquipment,
    });
    throw error;
  }
}

/** Aplica regla: snapshot viejo NO puede reemplazar estado más nuevo. */
export function shouldApplySnapshotEntry(
  incoming: PxSnapshotCacheEntry,
  appliedVersion: number
): boolean {
  const version = incoming.snapshot.reception.version ?? 1;
  return version >= appliedVersion;
}
