import type { PxScannedSeries } from '@/app/(erp)/recepcion/types/reception.types';
import type { PxBoxSnapshot } from '@/modules/recepcion/client/pxCapture';
import type { ScanPxEquipmentResult } from '@/app/(erp)/recepcion/services/pxIncrementalApi';

export function buildOptimisticScanResult(
  meta: PxBoxSnapshot | undefined,
  captured: number
): ScanPxEquipmentResult {
  return {
    success: true,
    equipmentId: `pending-${crypto.randomUUID()}`,
    capturedCount: captured + 1,
    declaredQuantity: meta?.declared_quantity ?? captured + 1,
    boxStatus: meta?.status ?? 'abierta',
  };
}

export function buildScannedSerialSet(scannedSeries: PxScannedSeries[]): Set<string> {
  const set = new Set<string>();
  for (const s of scannedSeries) {
    if (s.sn) set.add(String(s.sn).toUpperCase());
    if (s.s2) set.add(String(s.s2).toUpperCase());
    if (s.s3) set.add(String(s.s3).toUpperCase());
    if (s.s4) set.add(String(s.s4).toUpperCase());
  }
  return set;
}

export function buildScanEntry(
  boxCode: string,
  currentScans: string[],
  validScans: string[],
  material: string | undefined,
  equipmentId: string
): PxScannedSeries {
  const upper = (v: string) => v.trim().toUpperCase();
  return {
    boxCode,
    sn: validScans[0] ?? '',
    s2: currentScans[1]?.trim() ? upper(currentScans[1]) : undefined,
    s3: currentScans[2]?.trim() ? upper(currentScans[2]) : undefined,
    s4: currentScans[3]?.trim() ? upper(currentScans[3]) : undefined,
    material,
    equipmentId,
  };
}

export type OptimisticScanPatch = {
  nextSeries: PxScannedSeries[];
  pendingId: string;
  rollbackScans: string[];
  rollbackMeta?: PxBoxSnapshot;
  rollbackVersion?: number;
  seriesBeforePending: PxScannedSeries[];
  optimisticResult: ScanPxEquipmentResult;
};

export function buildOptimisticScanPatch(input: {
  boxCode: string;
  currentScans: string[];
  validScans: string[];
  material?: string;
  liveSeries: PxScannedSeries[];
  meta?: PxBoxSnapshot;
  boxVersion?: number;
}): OptimisticScanPatch {
  const optimisticResult = buildOptimisticScanResult(input.meta, input.meta?.captured_count ?? 0);
  const pendingId = optimisticResult.equipmentId;
  return {
    optimisticResult,
    pendingId,
    rollbackScans: [...input.currentScans],
    rollbackMeta: input.meta ? { ...input.meta } : undefined,
    rollbackVersion: input.boxVersion,
    seriesBeforePending: input.liveSeries,
    nextSeries: [
      ...input.liveSeries,
      buildScanEntry(
        input.boxCode,
        input.currentScans,
        input.validScans,
        input.material,
        pendingId
      ),
    ],
  };
}

export function reconcileScanSeriesWithResult(
  series: PxScannedSeries[],
  pendingId: string,
  result: ScanPxEquipmentResult
): PxScannedSeries[] {
  return series.map((s) =>
    s.equipmentId === pendingId ? { ...s, equipmentId: result.equipmentId } : s
  );
}

export function attachReentryCountToSeries(
  series: PxScannedSeries[],
  equipmentId: string,
  pendingId: string,
  count: number
): PxScannedSeries[] {
  return series.map((s) =>
    s.equipmentId === equipmentId || s.equipmentId === pendingId
      ? { ...s, reentryCount: count }
      : s
  );
}
