import { describe, expect, it } from 'vitest';
import { mergeScannedSeriesWithOverlay } from './pxReceptionViewModel';

describe('pxReceptionViewModel', () => {
  it('preserva escaneos optimistas pending sobre servidor', () => {
    const server = [{ boxCode: 'CAJA-1', sn: 'SN001', equipmentId: 'eq-1' }];
    const overlay = [{ boxCode: 'CAJA-1', sn: 'SN002', equipmentId: 'pending-abc' }];
    const merged = mergeScannedSeriesWithOverlay(server, overlay);
    expect(merged).toHaveLength(2);
    expect(merged.some((s) => s.sn === 'SN002')).toBe(true);
  });

  it('reconcilia equipmentId pending → real sin duplicar', () => {
    const server = [{ boxCode: 'CAJA-1', sn: 'SN001', equipmentId: 'eq-real' }];
    const overlay = [{ boxCode: 'CAJA-1', sn: 'SN001', equipmentId: 'eq-real' }];
    const merged = mergeScannedSeriesWithOverlay(server, overlay);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.equipmentId).toBe('eq-real');
  });
});
