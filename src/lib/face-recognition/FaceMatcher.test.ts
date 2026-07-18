import { describe, expect, it } from 'vitest';
import { FaceMatcher } from './FaceMatcher';

function unit(vec: number[]): Float32Array {
  const v = new Float32Array(vec);
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i]! * v[i]!;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] = v[i]! / n;
  return v;
}

describe('FaceMatcher', () => {
  it('elige la mejor coincidencia (best-of-N), no el promedio ni el primero', () => {
    const probe = unit([1, 0, 0, 0]);
    const matcher = new FaceMatcher();
    const result = matcher.matchBest(probe, [
      { employeeId: 'a', embeddingId: '1', vector: unit([0, 1, 0, 0]) },
      { employeeId: 'a', embeddingId: '2', vector: unit([0.95, 0.05, 0, 0]) },
      { employeeId: 'a', embeddingId: '3', vector: unit([0.2, 0.8, 0, 0]) },
    ]);
    expect(result.embeddingId).toBe('2');
    expect(result.distance).toBeLessThan(0.3);
  });

  it('euclideanDistance es simétrica', () => {
    const a = unit([1, 2, 3, 4]);
    const b = unit([4, 3, 2, 1]);
    expect(FaceMatcher.euclideanDistance(a, b)).toBeCloseTo(
      FaceMatcher.euclideanDistance(b, a),
      6,
    );
  });
});
