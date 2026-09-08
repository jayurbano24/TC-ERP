import { describe, expect, it, beforeEach } from 'vitest';
import {
  getPxScanToSnapshotRatio,
  getPxSnapshotMetricsSummary,
  recordPxScan,
  recordPxSnapshotFetch,
  resetPxSnapshotFetchMetrics,
} from './pxReceptionSessionMetrics';

describe('pxReceptionSessionMetrics — Phase 4 observability', () => {
  beforeEach(() => resetPxSnapshotFetchMetrics());

  it('scan_to_snapshot_ratio = GET / scans', () => {
    recordPxScan();
    recordPxScan();
    recordPxSnapshotFetch({
      event: 'px_snapshot_fetch',
      receptionId: 'r1',
      reason: 'SOFT_REFRESH',
      durationMs: 100,
      success: true,
      version: 2,
      includeEquipment: false,
    });

    expect(getPxScanToSnapshotRatio()).toBeCloseTo(0.5);
    const summary = getPxSnapshotMetricsSummary();
    expect(summary.scan_total).toBe(2);
    expect(summary.snapshot_get_total).toBe(1);
    expect(summary.scan_to_snapshot_ratio).toBeCloseTo(0.5);
    expect(summary.snapshot_get_duration_ms_total).toBe(100);
  });

  it('ratio sin scans devuelve snapshot_get_total', () => {
    recordPxSnapshotFetch({
      event: 'px_snapshot_fetch',
      receptionId: 'r1',
      reason: 'RESUME',
      durationMs: 50,
      success: true,
      includeEquipment: true,
    });
    expect(getPxScanToSnapshotRatio()).toBe(1);
  });

  it('ratio objetivo post-fix: 100 scans + 0 GET → 0', () => {
    for (let i = 0; i < 100; i += 1) recordPxScan();
    expect(getPxScanToSnapshotRatio()).toBe(0);
  });
});
