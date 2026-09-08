import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { createPxReceptionSessionStore } from './pxReceptionSessionStore';
import {
  getPxSnapshotAggregateMetrics,
  resetPxSnapshotFetchMetrics,
} from './pxReceptionSessionMetrics';
import { ingestPxSnapshotToCache } from './pxMutationCache';
import { pxReceptionQueryKey } from './pxReceptionSnapshotQuery';
import type { PxSnapshotCacheEntry, PxSnapshotReason } from './pxReceptionSession.types';
import type { PxReceptionSnapshot } from '@/modules/recepcion/client/pxCapture';
import {
  patchPxCacheAfterAdjustBox,
  patchPxCacheAfterCloseBox,
} from './pxMutationCache';

const RECEPTION_A = 'rec-a';
const RECEPTION_B = 'rec-b';
const BOX_ID = 'box-a1';

function buildSnapshot(receptionId: string, version: number): PxReceptionSnapshot {
  return {
    reception: {
      id: receptionId,
      guide_number: `REC-${version}`,
      status: 'EN_PROCESO',
      sap_document: null,
      carrier: null,
      notes: null,
      expected_units: 10,
      expected_units_sap: 10,
      received_units: 0,
      variance_units: null,
      variance_reason: null,
      version,
      created_at: new Date().toISOString(),
    },
    boxes: [
      {
        id: BOX_ID,
        box_code: 'CAJA-1',
        status: 'en_captura',
        declared_quantity: 10,
        captured_count: 3,
        rejected_count: 0,
        version: 2,
        brand_id: null,
        model_id: null,
        locked_by: null,
        lock_expires_at: null,
        lots: [],
        equipment: [],
        rejections: [],
      },
    ],
    total_captured: 3,
  };
}

function buildEntry(
  receptionId: string,
  version: number,
  reason: PxSnapshotReason,
  includeEquipment = false
): PxSnapshotCacheEntry {
  return {
    snapshot: buildSnapshot(receptionId, version),
    reason,
    includeEquipment,
    fetchedAt: Date.now(),
  };
}

describe('PX Phase 4 — store integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPxSnapshotFetchMetrics();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('TEST 3 — dedupe concurrente incrementa snapshot_get_deduped', async () => {
    const fetchSnapshot = vi.fn(async (id: string, params: { reason: PxSnapshotReason }) =>
      buildEntry(id, 1, params.reason)
    );

    const store = createPxReceptionSessionStore({
      softRefreshIdleMs: 45_000,
      fetchSnapshot: fetchSnapshot as never,
    });

    await store.start(RECEPTION_A);
    resetPxSnapshotFetchMetrics();
    fetchSnapshot.mockClear();

    let resolveFetch: ((entry: PxSnapshotCacheEntry) => void) | undefined;
    fetchSnapshot.mockImplementation(
      () =>
        new Promise<PxSnapshotCacheEntry>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const p1 = store.reconcile('EXPLICIT_REFRESH');
    const p2 = store.reconcile('EXPLICIT_REFRESH');
    await Promise.resolve();

    expect(getPxSnapshotAggregateMetrics().snapshot_get_deduped).toBe(1);
    resolveFetch!(buildEntry(RECEPTION_A, 2, 'EXPLICIT_REFRESH'));
    await Promise.all([p1, p2]);

    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it('TEST 5 — switchReception: snapshot tardío de A no modifica B', async () => {
    let resolveA: ((entry: PxSnapshotCacheEntry) => void) | undefined;
    const fetchSnapshot = vi.fn(async (id: string, params: { reason: PxSnapshotReason }) => {
      if (id === RECEPTION_A && params.reason === 'EXPLICIT_REFRESH') {
        return new Promise<PxSnapshotCacheEntry>((resolve) => {
          resolveA = resolve;
        });
      }
      return buildEntry(id, id === RECEPTION_A ? 1 : 5, params.reason);
    });

    const store = createPxReceptionSessionStore({
      softRefreshIdleMs: 45_000,
      fetchSnapshot: fetchSnapshot as never,
    });

    await store.start(RECEPTION_A);
    const pending = store.refresh('EXPLICIT_REFRESH');
    await store.switchReception(RECEPTION_B, () => true);

    expect(store.getState().receptionId).toBe(RECEPTION_B);
    expect(store.getState().appliedVersion).toBe(5);

    resolveA!(buildEntry(RECEPTION_A, 99, 'EXPLICIT_REFRESH'));
    await pending;

    expect(store.getState().receptionId).toBe(RECEPTION_B);
    expect(store.getState().appliedVersion).toBe(5);
  });

  it('TEST 6 — abort al cambiar recepción no aplica snapshot abortado', async () => {
    let resolveSlow: ((entry: PxSnapshotCacheEntry) => void) | undefined;
    const fetchSnapshot = vi.fn(async (_id: string, params: { reason: PxSnapshotReason }) => {
      if (params.reason === 'EXPLICIT_REFRESH') {
        return new Promise<PxSnapshotCacheEntry>((resolve) => {
          resolveSlow = resolve;
        });
      }
      return buildEntry(RECEPTION_B, 3, params.reason);
    });

    const store = createPxReceptionSessionStore({
      softRefreshIdleMs: 45_000,
      fetchSnapshot: fetchSnapshot as never,
    });

    await store.start(RECEPTION_A);
    const pending = store.refresh('EXPLICIT_REFRESH');
    await store.switchReception(RECEPTION_B, () => true);

    resolveSlow!(buildEntry(RECEPTION_A, 99, 'EXPLICIT_REFRESH'));
    await pending.catch(() => undefined);

    expect(store.getState().receptionId).toBe(RECEPTION_B);
    expect(store.getState().snapshotEntry?.snapshot.reception.version).toBe(3);
    expect(getPxSnapshotAggregateMetrics().snapshot_get_aborted).toBeGreaterThan(0);
  });

  it('TEST 2 — 100 soft refresh → 1 GET coalesced tras idle', async () => {
    const fetchSnapshot = vi.fn(async (id: string, params: { reason: PxSnapshotReason }) =>
      buildEntry(id, 2, params.reason)
    );
    const store = createPxReceptionSessionStore({
      softRefreshIdleMs: 45_000,
      fetchSnapshot: fetchSnapshot as never,
    });

    await store.start(RECEPTION_A);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 100; i += 1) {
      store.scheduleSoftReconciliation();
    }
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(45_000);
    expect(fetchSnapshot).toHaveBeenCalledTimes(2);
    expect(fetchSnapshot.mock.calls[1]?.[1]?.reason).toBe('SOFT_REFRESH');
  });
});

describe('PX Phase 4 — mutation cache (TEST 3 extended)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('adjustBox — patch cache sin GET', () => {
    ingestPxSnapshotToCache(
      queryClient,
      RECEPTION_A,
      buildSnapshot(RECEPTION_A, 1),
      'START',
      false
    );

    patchPxCacheAfterAdjustBox(queryClient, RECEPTION_A, {
      box_id: BOX_ID,
      declared_quantity: 15,
      captured_count: 3,
      version: 4,
    });

    const entry = queryClient.getQueryData<PxSnapshotCacheEntry>(pxReceptionQueryKey(RECEPTION_A));
    expect(entry?.snapshot.boxes[0]?.declared_quantity).toBe(15);
    expect(entry?.snapshot.boxes[0]?.version).toBe(4);
  });

  it('closeBox + adjustBox secuenciales — una sola fuente Query', () => {
    ingestPxSnapshotToCache(
      queryClient,
      RECEPTION_A,
      buildSnapshot(RECEPTION_A, 1),
      'START',
      false
    );

    patchPxCacheAfterCloseBox(queryClient, RECEPTION_A, {
      box_id: BOX_ID,
      status: 'cerrada',
      version: 5,
      captured_count: 10,
      declared_quantity: 10,
    });

    const afterClose = queryClient.getQueryData<PxSnapshotCacheEntry>(
      pxReceptionQueryKey(RECEPTION_A)
    );
    expect(afterClose?.snapshot.boxes[0]?.status).toBe('cerrada');
    expect(queryClient.getQueryData(pxReceptionQueryKey(RECEPTION_A))).toBeDefined();
  });
});
