import type { QueryClient } from '@tanstack/react-query';
import type { PxLotInput, PxBoxSnapshot, PxReceptionSnapshot } from '@/modules/recepcion/client/pxCapture';
import type { PxSnapshotCacheEntry } from './pxReceptionSession.types';
import { patchSnapshotBox } from './pxReceptionSelectors';
import { pxReceptionQueryKey } from './pxReceptionSnapshotQuery';

type BoxRpcPatch = {
  box_id: string;
  status?: string;
  version?: number;
  declared_quantity?: number;
  captured_count?: number;
};

function updateCacheEntry(
  queryClient: QueryClient,
  receptionId: string,
  updater: (entry: PxSnapshotCacheEntry) => PxSnapshotCacheEntry | null
): boolean {
  const key = pxReceptionQueryKey(receptionId);
  const current = queryClient.getQueryData<PxSnapshotCacheEntry>(key);
  if (!current) return false;
  const next = updater(current);
  if (!next) return false;
  queryClient.setQueryData(key, next);
  return true;
}

function bumpReceptionVersion(snapshot: PxReceptionSnapshot): PxReceptionSnapshot {
  return {
    ...snapshot,
    reception: {
      ...snapshot.reception,
      version: (snapshot.reception.version ?? 1) + 1,
    },
  };
}

/** Caso A — closeBox: respuesta RPC suficiente → patch cache, NO GET. */
export function patchPxCacheAfterCloseBox(
  queryClient: QueryClient,
  receptionId: string,
  rpcData: BoxRpcPatch
): boolean {
  return updateCacheEntry(queryClient, receptionId, (entry) => {
    let snapshot = patchSnapshotBox(entry.snapshot, rpcData.box_id, {
      status: rpcData.status ?? 'cerrada',
      version: rpcData.version,
      captured_count: rpcData.captured_count,
      declared_quantity: rpcData.declared_quantity,
      locked_by: null,
      lock_expires_at: null,
    });
    snapshot = bumpReceptionVersion(snapshot);
    return {
      ...entry,
      snapshot,
      fetchedAt: Date.now(),
    };
  });
}

/** Caso A — reopenBox: respuesta RPC suficiente → patch cache, NO GET. */
export function patchPxCacheAfterReopenBox(
  queryClient: QueryClient,
  receptionId: string,
  rpcData: BoxRpcPatch
): boolean {
  return updateCacheEntry(queryClient, receptionId, (entry) => {
    let snapshot = patchSnapshotBox(entry.snapshot, rpcData.box_id, {
      status: rpcData.status ?? 'en_captura',
      version: rpcData.version,
    });
    snapshot = bumpReceptionVersion(snapshot);
    return {
      ...entry,
      snapshot,
      fetchedAt: Date.now(),
    };
  });
}

/** Caso A — adjustBox: respuesta RPC suficiente → patch cache, NO GET. */
export function patchPxCacheAfterAdjustBox(
  queryClient: QueryClient,
  receptionId: string,
  rpcData: BoxRpcPatch
): boolean {
  return updateCacheEntry(queryClient, receptionId, (entry) => {
    let snapshot = patchSnapshotBox(entry.snapshot, rpcData.box_id, {
      declared_quantity: rpcData.declared_quantity,
      captured_count: rpcData.captured_count,
      version: rpcData.version,
    });
    snapshot = {
      ...snapshot,
      boxes: snapshot.boxes.map((box) =>
        box.id === rpcData.box_id
          ? {
              ...box,
              lots: box.lots.map((lot) => ({
                ...lot,
                expected_units: rpcData.declared_quantity ?? lot.expected_units,
              })),
            }
          : box
      ),
    };
    snapshot = bumpReceptionVersion(snapshot);
    return {
      ...entry,
      snapshot,
      fetchedAt: Date.now(),
    };
  });
}

/** Caso A parcial — appendLot: patch declared_quantity; manifest se deriva del snapshot. */
export function patchPxCacheAfterAppendLot(
  queryClient: QueryClient,
  receptionId: string,
  boxId: string,
  lot: PxLotInput,
  declaredQuantity: number
): boolean {
  return updateCacheEntry(queryClient, receptionId, (entry) => {
    let snapshot = bumpReceptionVersion(entry.snapshot);
    snapshot = {
      ...snapshot,
      boxes: snapshot.boxes.map((box) => {
        if (box.id !== boxId) return box;
        return {
          ...box,
          declared_quantity: declaredQuantity,
          lots: [
            ...box.lots,
            {
              id: `pending-lot-${crypto.randomUUID()}`,
              technology_name: lot.technologyName ?? null,
              brand_name: lot.brandName ?? null,
              model_name: lot.modelName ?? null,
              expected_units: lot.expectedUnits,
              brand_id: lot.brandId ?? null,
              model_id: lot.modelId ?? null,
            },
          ],
        } satisfies PxBoxSnapshot;
      }),
    };
    return { ...entry, snapshot, fetchedAt: Date.now() };
  });
}

/** Caso A parcial — createBox: agrega caja al snapshot sin GET. */
export function patchPxCacheAfterCreateBox(
  queryClient: QueryClient,
  receptionId: string,
  created: { id: string; box_code: string },
  lot: PxLotInput
): boolean {
  return updateCacheEntry(queryClient, receptionId, (entry) => {
    let snapshot = bumpReceptionVersion(entry.snapshot);
    snapshot = {
      ...snapshot,
      boxes: [
        ...snapshot.boxes,
        {
          id: created.id,
          box_code: created.box_code,
          status: 'en_captura',
          declared_quantity: lot.expectedUnits,
          captured_count: 0,
          rejected_count: 0,
          version: 1,
          brand_id: lot.brandId ?? null,
          model_id: lot.modelId ?? null,
          locked_by: null,
          lock_expires_at: null,
          lots: [
            {
              id: `pending-lot-${crypto.randomUUID()}`,
              technology_name: lot.technologyName ?? null,
              brand_name: lot.brandName ?? null,
              model_name: lot.modelName ?? null,
              expected_units: lot.expectedUnits,
              brand_id: lot.brandId ?? null,
              model_id: lot.modelId ?? null,
            },
          ],
          equipment: [],
          rejections: [],
        } satisfies PxBoxSnapshot,
      ],
    };
    return { ...entry, snapshot, fetchedAt: Date.now() };
  });
}

export function ingestPxSnapshotToCache(
  queryClient: QueryClient,
  receptionId: string,
  snapshot: PxReceptionSnapshot,
  reason: PxSnapshotCacheEntry['reason'],
  includeEquipment: boolean
): void {
  queryClient.setQueryData(pxReceptionQueryKey(receptionId), {
    snapshot,
    reason,
    includeEquipment,
    fetchedAt: Date.now(),
  } satisfies PxSnapshotCacheEntry);
}
