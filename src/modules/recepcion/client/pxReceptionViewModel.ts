import type { PxScannedSeries } from '@/app/(erp)/recepcion/types/reception.types';

/** Fusiona series del servidor con overlay optimista (escaneos pendientes / reentry). */
export function mergeScannedSeriesWithOverlay(
  serverSeries: PxScannedSeries[],
  overlay: PxScannedSeries[]
): PxScannedSeries[] {
  if (overlay.length === 0) return serverSeries;
  if (serverSeries.length === 0) return overlay;

  const serverIds = new Set(serverSeries.map((s) => s.equipmentId).filter(Boolean));
  const serverSerialKeys = new Set(
    serverSeries.map((s) => `${s.boxCode}:${s.sn}:${s.s2 ?? ''}:${s.s3 ?? ''}:${s.s4 ?? ''}`)
  );

  const pendingOverlay = overlay.filter((item) => {
    if (item.equipmentId?.startsWith('pending-')) return true;
    if (item.equipmentId && serverIds.has(item.equipmentId)) return false;
    const key = `${item.boxCode}:${item.sn}:${item.s2 ?? ''}:${item.s3 ?? ''}:${item.s4 ?? ''}`;
    return !serverSerialKeys.has(key);
  });

  const reconciledOverlay = overlay
    .filter((item) => item.equipmentId && !item.equipmentId.startsWith('pending-'))
    .map((item) => {
      const serverMatch = serverSeries.find(
        (s) =>
          s.equipmentId === item.equipmentId ||
          (s.boxCode === item.boxCode && s.sn === item.sn)
      );
      return serverMatch ? { ...serverMatch, reentryCount: item.reentryCount ?? serverMatch.reentryCount } : item;
    });

  const merged = [...serverSeries];
  for (const item of pendingOverlay) {
    const key = `${item.boxCode}:${item.sn}`;
    if (!merged.some((s) => s.boxCode === item.boxCode && s.sn === item.sn)) {
      merged.push(item);
    }
  }
  for (const item of reconciledOverlay) {
    const idx = merged.findIndex(
      (s) => s.equipmentId === item.equipmentId || (s.boxCode === item.boxCode && s.sn === item.sn)
    );
    if (idx >= 0) merged[idx] = item;
  }
  return merged;
}
