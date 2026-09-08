import { describe, expect, it } from 'vitest';
import {
  buildOptimisticScanResult,
  buildScannedSerialSet,
  buildScanEntry,
  buildOptimisticScanPatch,
  reconcileScanSeriesWithResult,
} from './pxScanCommands';

describe('pxScanCommands', () => {
  it('buildOptimisticScanResult incrementa captured_count', () => {
    const result = buildOptimisticScanResult(
      {
        id: 'b1',
        box_code: 'CAJA-1',
        status: 'en_captura',
        declared_quantity: 10,
        captured_count: 3,
        rejected_count: 0,
        version: 1,
        brand_id: null,
        model_id: null,
        lots: [],
        equipment: [],
        rejections: [],
      },
      3
    );
    expect(result.capturedCount).toBe(4);
    expect(result.equipmentId.startsWith('pending-')).toBe(true);
  });

  it('buildScannedSerialSet incluye todas las series en uppercase', () => {
    const set = buildScannedSerialSet([
      { boxCode: 'CAJA-1', sn: 'abc', s2: 'def' },
    ]);
    expect(set.has('ABC')).toBe(true);
    expect(set.has('DEF')).toBe(true);
  });

  it('reconcileScanSeriesWithResult reemplaza pending id', () => {
    const series = [{ boxCode: 'CAJA-1', sn: 'SN1', equipmentId: 'pending-x' }];
    const next = reconcileScanSeriesWithResult(series, 'pending-x', {
      success: true,
      equipmentId: 'real-eq',
      capturedCount: 1,
      declaredQuantity: 10,
      boxStatus: 'en_captura',
    });
    expect(next[0]?.equipmentId).toBe('real-eq');
  });

  it('buildOptimisticScanPatch agrega entrada pending', () => {
    const patch = buildOptimisticScanPatch({
      boxCode: 'CAJA-1',
      currentScans: ['SN1', '', '', ''],
      validScans: ['SN1'],
      liveSeries: [],
    });
    expect(patch.nextSeries).toHaveLength(1);
    expect(patch.pendingId.startsWith('pending-')).toBe(true);
  });

  it('buildScanEntry normaliza series', () => {
    const entry = buildScanEntry('CAJA-1', ['sn1', ' s2 '], ['SN1', 'S2'], undefined, 'eq-1');
    expect(entry.sn).toBe('SN1');
    expect(entry.s2).toBe('S2');
  });
});
