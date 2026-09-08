import type { PxSnapshotMetricEvent } from './pxReceptionSession.types';

const recentFetches: PxSnapshotMetricEvent[] = [];
const MAX_RECENT = 50;

export type PxSnapshotAggregateMetrics = {
  snapshot_get_total: number;
  snapshot_get_by_reason: Record<string, number>;
  snapshot_get_aborted: number;
  snapshot_get_deduped: number;
  snapshot_get_duration_ms_total: number;
  scan_total: number;
};

const aggregates: PxSnapshotAggregateMetrics = {
  snapshot_get_total: 0,
  snapshot_get_by_reason: {},
  snapshot_get_aborted: 0,
  snapshot_get_deduped: 0,
  snapshot_get_duration_ms_total: 0,
  scan_total: 0,
};

/** Registro interno para debugging y detección de regresiones (sin datos sensibles). */
export function recordPxSnapshotFetch(event: PxSnapshotMetricEvent): void {
  recentFetches.push(event);
  if (recentFetches.length > MAX_RECENT) recentFetches.shift();

  if (event.success) {
    aggregates.snapshot_get_total += 1;
    aggregates.snapshot_get_by_reason[event.reason] =
      (aggregates.snapshot_get_by_reason[event.reason] ?? 0) + 1;
    aggregates.snapshot_get_duration_ms_total += event.durationMs;
  }

  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[PX_SNAPSHOT]', {
      reception: event.receptionId,
      reason: event.reason,
      duration: Math.round(event.durationMs),
      success: event.success,
      version: event.version,
      equipment: event.includeEquipment,
    });
  }
}

export function recordPxSnapshotDeduped(): void {
  aggregates.snapshot_get_deduped += 1;
}

export function recordPxSnapshotAborted(): void {
  aggregates.snapshot_get_aborted += 1;
}

export function recordPxScan(): void {
  aggregates.scan_total += 1;
}

export function getPxScanToSnapshotRatio(): number {
  if (aggregates.scan_total === 0) return aggregates.snapshot_get_total;
  return aggregates.snapshot_get_total / aggregates.scan_total;
}

export function getPxSnapshotMetricsSummary(): Readonly<
  PxSnapshotAggregateMetrics & { scan_to_snapshot_ratio: number }
> {
  return {
    ...aggregates,
    scan_to_snapshot_ratio: getPxScanToSnapshotRatio(),
  };
}

export function getPxSnapshotAggregateMetrics(): Readonly<PxSnapshotAggregateMetrics> {
  return aggregates;
}

/** Expuesto para tests — no usar en producción UI. */
export function getRecentPxSnapshotFetches(): readonly PxSnapshotMetricEvent[] {
  return recentFetches;
}

export function resetPxSnapshotFetchMetrics(): void {
  recentFetches.length = 0;
  aggregates.snapshot_get_total = 0;
  aggregates.snapshot_get_by_reason = {};
  aggregates.snapshot_get_aborted = 0;
  aggregates.snapshot_get_deduped = 0;
  aggregates.snapshot_get_duration_ms_total = 0;
  aggregates.scan_total = 0;
}
