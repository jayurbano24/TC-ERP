import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createPxReceptionSessionStore, type PxSnapshotFetcher } from './pxReceptionSessionStore';
import { resetPxSnapshotFetchMetrics, getRecentPxSnapshotFetches } from './pxReceptionSessionMetrics';
import type { PxSnapshotCacheEntry, PxSnapshotReason } from './pxReceptionSession.types';
import type { PxReceptionSnapshot } from '@/modules/recepcion/client/pxCapture';

const RECEPTION_A = 'rec-a';
const RECEPTION_B = 'rec-b';

function buildSnapshot(receptionId: string, version: number, status = 'EN_PROCESO'): PxReceptionSnapshot {
  return {
    reception: {
      id: receptionId,
      guide_number: `REC-${version}`,
      status,
      sap_document: 'SAP-1',
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
    boxes: [],
    total_captured: 0,
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

describe('PxReceptionSessionStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPxSnapshotFetchMetrics();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createTestStore(fetchImpl?: PxSnapshotFetcher) {
    const fetchSnapshot = vi.fn(fetchImpl ?? defaultFetcher);
    const store = createPxReceptionSessionStore({
      softRefreshIdleMs: 45_000,
      fetchSnapshot: fetchSnapshot as PxSnapshotFetcher,
    });
    return { store, fetchSnapshot };
  }

  async function defaultFetcher(
    receptionId: string,
    params: { reason: PxSnapshotReason; includeEquipment: boolean }
  ): Promise<PxSnapshotCacheEntry> {
    await Promise.resolve();
    return buildEntry(receptionId, 1, params.reason, params.includeEquipment);
  }

  it('TEST 4 — resume con sessionId: un solo RESUME', async () => {
    const { store, fetchSnapshot } = createTestStore();
    const ok = await store.resume(RECEPTION_A, () => true);
    expect(ok).toBe(true);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(fetchSnapshot.mock.calls[0]?.[1]?.reason).toBe('RESUME');
  });

  it('TEST 9 — resume idempotente no repite fetch', async () => {
    const { store, fetchSnapshot } = createTestStore();
    await store.resume(RECEPTION_A, () => true);
    await store.resume(RECEPTION_A, () => true);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it('TEST 2 — notify listeners sin fetch en re-renders simulados', async () => {
    const { store, fetchSnapshot } = createTestStore();
    await store.resume(RECEPTION_A, () => true);

    let renderCount = 0;
    store.subscribe(() => {
      renderCount += 1;
    });

    for (let i = 0; i < 100; i += 1) {
      store.getState();
    }

    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(renderCount).toBe(0);
  });

  it('TEST 3 — 100 reconcile SOFT_REFRESH coalesced en un timer', async () => {
    const { store, fetchSnapshot } = createTestStore(async (id, params) =>
      buildEntry(id, 2, params.reason, params.includeEquipment)
    );
    await store.start(RECEPTION_A);

    for (let i = 0; i < 100; i += 1) {
      store.scheduleSoftReconciliation();
    }

    expect(fetchSnapshot).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(45_000);
    expect(fetchSnapshot).toHaveBeenCalledTimes(2);
    expect(fetchSnapshot.mock.calls[1]?.[1]?.reason).toBe('SOFT_REFRESH');
  });

  it('TEST 7 — switchReception cancela soft refresh de recepción anterior', async () => {
    const { store, fetchSnapshot } = createTestStore(async (id, params) =>
      buildEntry(id, id === RECEPTION_A ? 1 : 3, params.reason, params.includeEquipment)
    );

    await store.start(RECEPTION_A);
    store.scheduleSoftReconciliation();
    await store.switchReception(RECEPTION_B, () => true);

    await vi.advanceTimersByTimeAsync(45_000);
    const reasons = fetchSnapshot.mock.calls.map((call) => call[1]?.reason);
    expect(reasons).not.toContain('SOFT_REFRESH');
    expect(store.getState().receptionId).toBe(RECEPTION_B);
  });

  it('TEST 8 — snapshot viejo no pisa versión más nueva', async () => {
    const { store, fetchSnapshot } = createTestStore();

    fetchSnapshot.mockImplementationOnce(async (id, params) =>
      buildEntry(id, 11, params.reason, params.includeEquipment)
    );
    await store.start(RECEPTION_A);
    expect(store.getState().appliedVersion).toBe(11);

    fetchSnapshot.mockImplementationOnce(async (id, params) =>
      buildEntry(id, 10, params.reason, params.includeEquipment)
    );
    await store.reconcile('ERROR_RECONCILIATION');

    expect(store.getState().appliedVersion).toBe(11);
    expect(store.getState().snapshotEntry?.snapshot.reception.version).toBe(11);
  });

  it('TEST 6 — generación invalidada impide aplicar snapshot tardío', async () => {
    let resolveSlowFetch: ((entry: PxSnapshotCacheEntry) => void) | undefined;
    const { store } = createTestStore(async (id, params) => {
      if (params.reason === 'EXPLICIT_REFRESH') {
        return new Promise<PxSnapshotCacheEntry>((resolve) => {
          resolveSlowFetch = resolve;
        });
      }
      return buildEntry(id, 1, params.reason, params.includeEquipment);
    });

    await store.start(RECEPTION_A);
    const pending = store.reconcile('EXPLICIT_REFRESH');
    store.clearSession();
    resolveSlowFetch!(buildEntry(RECEPTION_A, 99, 'EXPLICIT_REFRESH'));
    await pending;

    expect(store.getState().snapshotEntry).toBeNull();
    expect(store.getState().appliedVersion).toBe(0);
  });

  it('registra métricas px_snapshot_fetch con reason', async () => {
    const { recordPxSnapshotFetch } = await import('./pxReceptionSessionMetrics');
    resetPxSnapshotFetchMetrics();
    recordPxSnapshotFetch({
      event: 'px_snapshot_fetch',
      receptionId: RECEPTION_A,
      reason: 'START',
      durationMs: 12,
      success: true,
      version: 2,
      includeEquipment: false,
    });
    const events = getRecentPxSnapshotFetches();
    expect(events.some((e) => e.reason === 'START' && e.receptionId === RECEPTION_A)).toBe(true);
  });

  it('ingestSnapshot aplica mutación sin GET', async () => {
    const { store, fetchSnapshot } = createTestStore();
    store.ingestSnapshot(buildSnapshot(RECEPTION_A, 7), 'MUTATION_RECONCILIATION', false);
    expect(store.getState().appliedVersion).toBe(7);
    expect(fetchSnapshot).not.toHaveBeenCalled();
  });
});

describe('pxReceptionSession architecture guards', () => {
  it('no acopla resume a useEffect con pxState en incremental hook', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const hook = readFileSync(
      join(process.cwd(), 'src/app/(erp)/recepcion/hooks/useReceptionPXIncremental.ts'),
      'utf8'
    );
    expect(hook).toContain('usePxReceptionSession');
    expect(hook).not.toContain('[applySnapshot, pxState]');
    expect(hook).not.toContain('resumeStartedRef');
    expect(hook).not.toMatch(/useEffect\([\s\S]*fetchPxReceptionSnapshot[\s\S]*\[applySnapshot/);
  });
});
