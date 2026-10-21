import { describe, expect, it } from 'vitest';
import {
  chunkClassifyUnits,
  CLASSIFY_EQUIPMENT_RPC_CHUNK_SIZE,
  isClassifyUpstreamTimeout,
} from './classify-equipment-batch-chunk';

describe('classify-equipment-batch-chunk', () => {
  it('parte en lotes de tamaño fijo', () => {
    const units = [1, 2, 3, 4, 5];
    expect(chunkClassifyUnits(units, 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('default chunk size es 2', () => {
    expect(CLASSIFY_EQUIPMENT_RPC_CHUNK_SIZE).toBe(2);
    expect(chunkClassifyUnits([1, 2, 3])).toEqual([[1, 2], [3]]);
  });

  it('detecta upstream timeout', () => {
    expect(isClassifyUpstreamTimeout('upstream request timeout')).toBe(true);
    expect(isClassifyUpstreamTimeout('Serie duplicada')).toBe(false);
  });
});
