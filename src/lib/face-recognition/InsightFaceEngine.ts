import * as ort from 'onnxruntime-web';
import { RECOGNITION_CONFIG } from '@/config/recognition';
import { FaceDetector } from './FaceDetector';
import { EmbeddingGenerator } from './EmbeddingGenerator';
import { imageQualityValidator } from './ImageQualityValidator';
import { faceQualityScore } from './FaceQualityScore';
import type { AnalyzeFrameResult } from './types';

/**
 * Pipeline síncrono detect → quality → embed.
 * Pensado para ejecutarse dentro del Web Worker (o fallback en main).
 */
export class InsightFaceEngine {
  private detector = new FaceDetector();
  private embedder = new EmbeddingGenerator();
  private initialized = false;

  async init(detectionUrl?: string, recognitionUrl?: string): Promise<void> {
    if (this.initialized) return;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;
    ort.env.wasm.wasmPaths = '/onnx/';
    const base = RECOGNITION_CONFIG.MODEL_BASE_URL;
    const det = detectionUrl ?? `${base}/${RECOGNITION_CONFIG.DETECTION_MODEL_FILE}`;
    const rec = recognitionUrl ?? `${base}/${RECOGNITION_CONFIG.RECOGNITION_MODEL_FILE}`;
    await Promise.all([this.detector.load(det), this.embedder.load(rec)]);
    this.initialized = true;
  }

  get ready(): boolean {
    return this.initialized && this.detector.ready && this.embedder.ready;
  }

  /**
   * @param mode `match` = marcaje (umbral más permisivo); `enroll` = enrolamiento estricto
   */
  async analyze(
    imageData: ImageData,
    mode: 'match' | 'enroll' = 'match',
  ): Promise<AnalyzeFrameResult> {
    if (!this.ready) throw new Error('InsightFaceEngine no listo');

    const minScore =
      mode === 'enroll'
        ? RECOGNITION_CONFIG.MIN_QUALITY_SCORE
        : RECOGNITION_CONFIG.MIN_QUALITY_SCORE_MATCH;

    const faces = await this.detector.detect(imageData);

    if (faces.length === 0) {
      const quality = faceQualityScore.score(
        {
          brightness: 0,
          sharpness: 0,
          contrast: 0,
          faceSize: 0,
          tilt: 0,
          faceCount: 0,
          centered: false,
        },
        0,
        minScore,
      );
      return { faces, quality, embedding: null, rejectReason: 'No se detectó un rostro' };
    }

    if (faces.length > RECOGNITION_CONFIG.MAX_FACES) {
      const gate = imageQualityValidator.validate(imageData, faces);
      const quality = faceQualityScore.score(gate.metrics, faces[0]!.box.score, minScore);
      return {
        faces,
        quality: { ...quality, passed: false },
        embedding: null,
        rejectReason: 'Se detectó más de una persona',
      };
    }

    const gate = imageQualityValidator.validate(imageData, faces);
    const quality = faceQualityScore.score(gate.metrics, faces[0]!.box.score, minScore);

    if (!gate.ok) {
      return {
        faces,
        quality: { ...quality, passed: false, reasons: [gate.reason ?? 'Calidad insuficiente'] },
        embedding: null,
        rejectReason: gate.reason,
      };
    }

    if (!quality.passed) {
      return {
        faces,
        quality,
        embedding: null,
        rejectReason:
          quality.reasons[0] ??
          `Calidad insuficiente (${quality.score}/${minScore})`,
      };
    }

    const embedding = await this.embedder.generate(imageData, faces[0]!);
    return { faces, quality, embedding };
  }
}
