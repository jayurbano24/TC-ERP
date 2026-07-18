import { thresholdManager } from './ThresholdManager';
import type { MatchCandidate, MatchResult } from './types';

/**
 * Compara un probe contra N embeddings y elige siempre la mejor coincidencia.
 * No usa promedio ni el primer embedding.
 */
export class FaceMatcher {
  /** Distancia euclidiana L2 (preferible con vectores L2-normalizados). */
  static euclideanDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
    if (a.length !== b.length) {
      throw new Error(`Dimensión incompatible: ${a.length} vs ${b.length}`);
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i]! - b[i]!;
      sum += d * d;
    }
    return Math.sqrt(sum);
  }

  static cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
    if (a.length !== b.length) {
      throw new Error(`Dimensión incompatible: ${a.length} vs ${b.length}`);
    }
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      const x = a[i]!;
      const y = b[i]!;
      dot += x * y;
      na += x * x;
      nb += y * y;
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    if (denom === 0) return 0;
    return dot / denom;
  }

  /**
   * Best-of-N: menor distancia entre el probe y todos los candidatos.
   */
  matchBest(probe: ArrayLike<number>, candidates: MatchCandidate[]): MatchResult {
    const model = thresholdManager.activeModel;
    if (!candidates.length) {
      return {
        matched: false,
        employeeId: null,
        embeddingId: null,
        distance: Number.POSITIVE_INFINITY,
        confidence: 0,
        model,
      };
    }

    let bestDistance = Number.POSITIVE_INFINITY;
    let best: MatchCandidate | null = null;

    for (const candidate of candidates) {
      const dist = FaceMatcher.euclideanDistance(probe, candidate.vector);
      if (dist < bestDistance) {
        bestDistance = dist;
        best = candidate;
      }
    }

    const confidence = thresholdManager.distanceToConfidence(bestDistance);
    const matched = thresholdManager.isMatch(bestDistance, confidence);

    return {
      matched,
      employeeId: best?.employeeId ?? null,
      embeddingId: best?.embeddingId ?? null,
      distance: bestDistance,
      confidence,
      model,
    };
  }
}

export const faceMatcher = new FaceMatcher();
