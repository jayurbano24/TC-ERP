import { describe, expect, it } from 'vitest';
import {
  chunkClassifyUnits,
  CLASSIFY_EQUIPMENT_RPC_CHUNK_SIZE,
  getClassifyRetryDelayMs,
  isClassifyUpstreamTimeout,
} from './classify-equipment-batch-chunk';

describe('classify-equipment-batch-chunk', () => {
  it('parte en lotes de tamaño fijo', () => {
    const units = [1, 2, 3, 4, 5];
    expect(chunkClassifyUnits(units, 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('default chunk size es 1 (1 equipo por RPC)', () => {
    expect(CLASSIFY_EQUIPMENT_RPC_CHUNK_SIZE).toBe(1);
    expect(chunkClassifyUnits([1, 2, 3])).toEqual([[1], [2], [3]]);
  });

  it('detecta timeouts técnicos', () => {
    expect(isClassifyUpstreamTimeout('upstream request timeout')).toBe(true);
    expect(isClassifyUpstreamTimeout('request timeout')).toBe(true);
    expect(isClassifyUpstreamTimeout('Gateway timed out')).toBe(true);
    expect(isClassifyUpstreamTimeout('ETIMEDOUT timeout')).toBe(true);
    expect(isClassifyUpstreamTimeout('Serie duplicada')).toBe(false);
  });

  it('delays de reintento: 0ms, 2s, 4s', () => {
    expect(getClassifyRetryDelayMs(0)).toBe(0);
    expect(getClassifyRetryDelayMs(1)).toBe(2000);
    expect(getClassifyRetryDelayMs(2)).toBe(4000);
  });

  it('detecta el timeout después de humanizar el error del RPC', () => {
    expect(
      isClassifyUpstreamTimeout(
        'El servidor tardó demasiado en guardar los equipos. Espere un momento y pulse Finalizar de nuevo.',
      ),
    ).toBe(true);
  });
});
