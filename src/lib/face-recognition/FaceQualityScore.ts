import { RECOGNITION_CONFIG } from '@/config/recognition';
import type { FaceQualityScoreResult, ImageQualityMetrics } from './types';
import { thresholdManager } from './ThresholdManager';

/**
 * Produce un score compuesto 0–100 a partir de métricas de captura.
 * Score < MIN_QUALITY_SCORE → no se almacena el embedding.
 */
export class FaceQualityScore {
  score(
    metrics: ImageQualityMetrics,
    detectionScore: number,
    minScore = thresholdManager.minQualityScore,
  ): FaceQualityScoreResult {
    const reasons: string[] = [];
    let total = 0;
    let weightSum = 0;

    const add = (value: number, weight: number, reasonIfLow: string, minOk: number) => {
      const clamped = Math.max(0, Math.min(100, value));
      total += clamped * weight;
      weightSum += weight;
      if (clamped < minOk) reasons.push(reasonIfLow);
    };

    // Iluminación: pico en el centro del rango permitido
    const mid =
      (RECOGNITION_CONFIG.MIN_BRIGHTNESS + RECOGNITION_CONFIG.MAX_BRIGHTNESS) / 2;
    const brightSpan =
      (RECOGNITION_CONFIG.MAX_BRIGHTNESS - RECOGNITION_CONFIG.MIN_BRIGHTNESS) / 2;
    const brightScore = 100 - (Math.abs(metrics.brightness - mid) / brightSpan) * 100;
    add(brightScore, 0.2, 'Iluminación fuera de rango óptimo', 55);

    // Nitidez
    const sharpScore = Math.min(100, (metrics.sharpness / (RECOGNITION_CONFIG.MIN_SHARPNESS * 2.5)) * 100);
    add(sharpScore, 0.25, 'Nitidez baja (posible blur)', 55);

    // Contraste
    const contrastScore = Math.min(100, (metrics.contrast / (RECOGNITION_CONFIG.MIN_CONTRAST * 2)) * 100);
    add(contrastScore, 0.15, 'Contraste bajo', 50);

    // Tamaño del rostro
    const sizeScore = Math.min(100, (metrics.faceSize / (RECOGNITION_CONFIG.MIN_FACE_SIZE * 2)) * 100);
    add(sizeScore, 0.15, 'Acerque el rostro a la cámara', 55);

    // Inclinación (menor = mejor)
    const tiltScore = Math.max(0, 100 - (metrics.tilt / RECOGNITION_CONFIG.MAX_TILT_DEG) * 100);
    add(tiltScore, 0.1, 'Incline menos el rostro', 55);

    // Centrado
    add(metrics.centered ? 100 : 40, 0.05, 'Centre el rostro en el recuadro', 60);

    // Score del detector + heurística de oclusión (bbox muy ancho/estrecho)
    const detScore = detectionScore * 100;
    add(detScore, 0.1, 'Detección débil (posible oclusión)', 45);

    const score = weightSum ? Math.round(total / weightSum) : 0;

    // Si score pasa umbral numérico pero hay razones críticas de oclusión/detección, aún puede fallar
    const criticalFail =
      detScore < 40 ||
      metrics.faceSize < RECOGNITION_CONFIG.MIN_FACE_SIZE ||
      metrics.sharpness < RECOGNITION_CONFIG.MIN_SHARPNESS;

    return {
      score,
      metrics,
      reasons: criticalFail && reasons.length === 0 ? ['Calidad insuficiente'] : reasons,
      passed: score >= minScore && !criticalFail,
    };
  }
}

export const faceQualityScore = new FaceQualityScore();
