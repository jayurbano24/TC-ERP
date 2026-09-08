import type { PxSnapshotMetricEvent } from './pxReceptionSession.types';

const recentFetches: PxSnapshotMetricEvent[] = [];
const MAX_RECENT = 50;

/** Registro interno para debugging y detección de regresiones (sin datos sensibles). */
export function recordPxSnapshotFetch(event: PxSnapshotMetricEvent): void {
  recentFetches.push(event);
  if (recentFetches.length > MAX_RECENT) recentFetches.shift();

  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[px_snapshot_fetch]', {
      receptionId: event.receptionId,
      reason: event.reason,
      durationMs: Math.round(event.durationMs),
      success: event.success,
      version: event.version,
      includeEquipment: event.includeEquipment,
    });
  }
}

/** Expuesto para tests — no usar en producción UI. */
export function getRecentPxSnapshotFetches(): readonly PxSnapshotMetricEvent[] {
  return recentFetches;
}

export function resetPxSnapshotFetchMetrics(): void {
  recentFetches.length = 0;
}
