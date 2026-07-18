import * as ort from 'onnxruntime-web';
import { RECOGNITION_CONFIG } from '@/config/recognition';
import { cropFaceToArcFaceTensor, l2Normalize } from './preprocess';
import type { DetectedFace, FaceEmbedding } from './types';
import { thresholdManager } from './ThresholdManager';

/**
 * Genera embeddings ArcFace 512-d (MobileFaceNet w600k_mbf / buffalo_sc).
 */
export class EmbeddingGenerator {
  private session: ort.InferenceSession | null = null;
  private inputName = 'input.1';

  async load(modelUrl: string): Promise<void> {
    this.session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    this.inputName = this.session.inputNames[0] ?? 'input.1';
  }

  get ready(): boolean {
    return this.session !== null;
  }

  async generate(imageData: ImageData, face: DetectedFace): Promise<FaceEmbedding> {
    if (!this.session) throw new Error('EmbeddingGenerator no inicializado');

    const inputTensor = cropFaceToArcFaceTensor(imageData, face, 112, 0.2);
    const input = new ort.Tensor('float32', inputTensor, [1, 3, 112, 112]);
    const outputs = await this.session.run({ [this.inputName]: input });
    const outName = this.session.outputNames[0]!;
    const raw = outputs[outName]!.data as Float32Array;

    if (raw.length < thresholdManager.embeddingDim) {
      throw new Error(`Embedding inesperado: dim=${raw.length}`);
    }

    const sliced = raw.length === thresholdManager.embeddingDim
      ? raw
      : raw.subarray(0, thresholdManager.embeddingDim);

    return {
      vector: l2Normalize(new Float32Array(sliced)),
      model: RECOGNITION_CONFIG.ACTIVE_MODEL,
    };
  }
}
