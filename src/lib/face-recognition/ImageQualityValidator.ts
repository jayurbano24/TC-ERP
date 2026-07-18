import { RECOGNITION_CONFIG } from '@/config/recognition';
import { computeImageQualityMetrics } from './imageMetrics';
import type { DetectedFace, QualityGateResult } from './types';

/**
 * Gates duros previos al reconocimiento/enrolamiento.
 * Si falla, no se genera matching ni se guarda embedding.
 */
export class ImageQualityValidator {
  validate(imageData: ImageData, faces: DetectedFace[]): QualityGateResult {
    const metrics = computeImageQualityMetrics(imageData, faces);

    if (metrics.faceCount === 0) {
      return { ok: false, reason: 'No se detectó un rostro', metrics };
    }
    if (metrics.faceCount > RECOGNITION_CONFIG.MAX_FACES) {
      return { ok: false, reason: 'Se detectó más de una persona', metrics };
    }
    if (faces[0]!.box.score < RECOGNITION_CONFIG.DETECTION_SCORE_MIN) {
      return { ok: false, reason: 'Confianza de detección insuficiente', metrics };
    }
    if (metrics.faceSize < RECOGNITION_CONFIG.MIN_FACE_SIZE) {
      return { ok: false, reason: 'Acerque el rostro a la cámara', metrics };
    }
    if (!metrics.centered) {
      return { ok: false, reason: 'Centre el rostro en el recuadro', metrics };
    }
    if (metrics.brightness < RECOGNITION_CONFIG.MIN_BRIGHTNESS) {
      return { ok: false, reason: 'Iluminación insuficiente', metrics };
    }
    if (metrics.brightness > RECOGNITION_CONFIG.MAX_BRIGHTNESS) {
      return { ok: false, reason: 'Iluminación excesiva', metrics };
    }
    if (metrics.sharpness < RECOGNITION_CONFIG.MIN_SHARPNESS) {
      return { ok: false, reason: 'Imagen desenfocada; mantenga el rostro estable', metrics };
    }
    if (metrics.contrast < RECOGNITION_CONFIG.MIN_CONTRAST) {
      return { ok: false, reason: 'Contraste insuficiente', metrics };
    }
    if (metrics.tilt > RECOGNITION_CONFIG.MAX_TILT_DEG) {
      return { ok: false, reason: 'Incline menos el rostro', metrics };
    }

    return { ok: true, metrics };
  }
}

export const imageQualityValidator = new ImageQualityValidator();
