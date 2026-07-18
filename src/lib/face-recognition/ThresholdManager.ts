import { RECOGNITION_CONFIG } from '@/config/recognition';

/**
 * Acceso tipado a umbrales de reconocimiento (sin magic numbers en callers).
 */
export class ThresholdManager {
  get activeModel(): string {
    return RECOGNITION_CONFIG.ACTIVE_MODEL;
  }

  get embeddingDim(): number {
    return RECOGNITION_CONFIG.EMBEDDING_DIM;
  }

  get minQualityScore(): number {
    return RECOGNITION_CONFIG.MIN_QUALITY_SCORE;
  }

  get minQualityScoreMatch(): number {
    return RECOGNITION_CONFIG.MIN_QUALITY_SCORE_MATCH;
  }

  get maxDistance(): number {
    return RECOGNITION_CONFIG.MAX_DISTANCE;
  }

  get minConfidence(): number {
    return RECOGNITION_CONFIG.MIN_CONFIDENCE;
  }

  get duplicateMaxDistance(): number {
    return RECOGNITION_CONFIG.DUPLICATE_MAX_DISTANCE;
  }

  get minEnrollmentCount(): number {
    return RECOGNITION_CONFIG.MIN_ENROLLMENT_COUNT;
  }

  get maxEnrollmentCount(): number {
    return RECOGNITION_CONFIG.MAX_ENROLLMENT_COUNT;
  }

  get maxFaces(): number {
    return RECOGNITION_CONFIG.MAX_FACES;
  }

  get detectionScoreMin(): number {
    return RECOGNITION_CONFIG.DETECTION_SCORE_MIN;
  }

  get minFaceSize(): number {
    return RECOGNITION_CONFIG.MIN_FACE_SIZE;
  }

  /**
   * Confianza 0–100 alineada al umbral de match:
   * - distance 0 → 100
   * - distance == MAX_DISTANCE → MIN_CONFIDENCE (aceptado)
   * - distance >= 1.5 * MAX_DISTANCE → 0
   */
  distanceToConfidence(distance: number): number {
    const max = this.maxDistance;
    const floor = this.minConfidence;
    if (!Number.isFinite(distance) || distance < 0) return 0;
    if (distance <= 0) return 100;
    if (distance <= max) {
      const t = distance / max;
      return Math.round(100 - t * (100 - floor));
    }
    const far = max * 1.5;
    if (distance >= far) return 0;
    const t = (distance - max) / (far - max);
    return Math.round(floor * (1 - t));
  }

  /** Match por distancia L2; la confianza es solo informativa en UI. */
  isMatch(distance: number, _confidence?: number): boolean {
    return Number.isFinite(distance) && distance <= this.maxDistance;
  }
}

export const thresholdManager = new ThresholdManager();
