import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createPxReceptionSessionStore } from './pxReceptionSessionStore';
import {
  getPxSnapshotAggregateMetrics,
  recordPxScan,
  resetPxSnapshotFetchMetrics,
} from './pxReceptionSessionMetrics';

describe('PX scan vs snapshot ratio', () => {
  beforeEach(() => {
    resetPxSnapshotFetchMetrics();
  });

  it('TEST 2 — 100 scans registrados sin incrementar snapshot_get por scan', () => {
    for (let i = 0; i < 100; i += 1) {
      recordPxScan();
    }
    const metrics = getPxSnapshotAggregateMetrics();
    expect(metrics.scan_total).toBe(100);
    expect(metrics.snapshot_get_total).toBe(0);
  });

  it('TEST 1 — render storm: 100 getState no dispara fetch', async () => {
    vi.useFakeTimers();
    const fetchSnapshot = vi.fn(async (id: string, params: { reason: string }) => ({
      snapshot: {
        reception: {
          id,
          guide_number: 'G1',
          status: 'EN_PROCESO',
          sap_document: null,
          carrier: null,
          notes: null,
          expected_units: 1,
          expected_units_sap: 1,
          received_units: 0,
          variance_units: null,
          variance_reason: null,
          version: 1,
          created_at: new Date().toISOString(),
        },
        boxes: [],
        total_captured: 0,
      },
      reason: params.reason,
      includeEquipment: true,
      fetchedAt: Date.now(),
    }));

    const store = createPxReceptionSessionStore({
      softRefreshIdleMs: 45_000,
      fetchSnapshot: fetchSnapshot as never,
    });

    await store.resume('rec-storm', () => true);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 100; i += 1) {
      store.getState();
    }
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
