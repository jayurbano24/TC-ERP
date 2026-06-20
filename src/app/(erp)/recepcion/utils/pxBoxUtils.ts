import type { PxManifestItem, PxScannedSeries } from '../types/reception.types';

export type PxBoxStats = {
  lots: PxManifestItem[];
  totalExpected: number;
  received: number;
  isComplete: boolean;
  isEmpty: boolean;
};

export function getPxBoxStats(
  boxCode: string,
  manifestItems: PxManifestItem[],
  scannedSeries: PxScannedSeries[]
): PxBoxStats {
  const lots = manifestItems.filter((i) => i.boxCode === boxCode);
  const totalExpected = lots.reduce((acc, i) => acc + (i.totalEsperado || 0), 0);
  const received = scannedSeries.filter((s) => s.boxCode === boxCode).length;
  return {
    lots,
    totalExpected,
    received,
    isComplete: totalExpected > 0 && received >= totalExpected,
    isEmpty: lots.length === 0 && received === 0,
  };
}

/** Cajas con al menos un lote o serie escaneada. */
export function getPxActiveBoxCodes(
  manifestItems: PxManifestItem[],
  scannedSeries: PxScannedSeries[]
): string[] {
  const codes = new Set<string>();
  manifestItems.forEach((i) => codes.add(i.boxCode));
  scannedSeries.forEach((s) => codes.add(s.boxCode));
  return Array.from(codes).filter(
    (code) => !getPxBoxStats(code, manifestItems, scannedSeries).isEmpty
  );
}

export function canClosePxBox(
  boxCode: string,
  manifestItems: PxManifestItem[],
  scannedSeries: PxScannedSeries[]
): { ok: true } | { ok: false; reason: string } {
  const stats = getPxBoxStats(boxCode, manifestItems, scannedSeries);
  if (stats.isEmpty) {
    return { ok: false, reason: 'La caja no tiene lotes ni equipos escaneados.' };
  }
  if (stats.totalExpected === 0) {
    return { ok: false, reason: 'Configure al menos un lote con cantidad esperada.' };
  }
  if (!stats.isComplete) {
    return {
      ok: false,
      reason: `La caja está incompleta (${stats.received} de ${stats.totalExpected} equipos).`,
    };
  }
  return { ok: true };
}

export function validatePxFinalizeReadiness(
  manifestItems: PxManifestItem[],
  scannedSeries: PxScannedSeries[],
  closedBoxes: string[]
): { ok: true; boxCodes: string[] } | { ok: false; reason: string } {
  const boxCodes = getPxActiveBoxCodes(manifestItems, scannedSeries);
  if (boxCodes.length === 0) {
    return { ok: false, reason: 'No hay cajas con equipos para finalizar.' };
  }
  if (scannedSeries.length === 0) {
    return { ok: false, reason: 'No hay series escaneadas.' };
  }

  for (const code of boxCodes) {
    const stats = getPxBoxStats(code, manifestItems, scannedSeries);
    if (!stats.isComplete) {
      return {
        ok: false,
        reason: `${code} está incompleta (${stats.received}/${stats.totalExpected}). Ciérrela solo cuando esté llena.`,
      };
    }
    if (!closedBoxes.includes(code)) {
      return {
        ok: false,
        reason: `Debe cerrar ${code} antes de finalizar la recepción (botón "Cerrar caja").`,
      };
    }
  }

  return { ok: true, boxCodes };
}
