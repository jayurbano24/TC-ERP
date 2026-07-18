import { describe, expect, it } from 'vitest';
import { thresholdManager } from './ThresholdManager';

describe('ThresholdManager', () => {
  it('a MAX_DISTANCE la confianza es >= MIN_CONFIDENCE y isMatch es true', () => {
    const d = thresholdManager.maxDistance;
    const conf = thresholdManager.distanceToConfidence(d);
    expect(conf).toBeGreaterThanOrEqual(thresholdManager.minConfidence);
    expect(thresholdManager.isMatch(d, conf)).toBe(true);
  });

  it('por encima de MAX_DISTANCE no hace match', () => {
    const d = thresholdManager.maxDistance + 0.01;
    expect(thresholdManager.isMatch(d)).toBe(false);
  });

  it('distancia 0 → confianza 100', () => {
    expect(thresholdManager.distanceToConfidence(0)).toBe(100);
  });
});
