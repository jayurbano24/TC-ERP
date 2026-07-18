import { RECOGNITION_CONFIG } from '@/config/recognition';
import { InsightFaceEngine } from './InsightFaceEngine';
import { faceMatcher } from './FaceMatcher';
import { faceEmbeddingRepository } from './FaceEmbeddingRepository';
import { thresholdManager } from './ThresholdManager';
import { videoFrameToImageData } from './preprocess';
import type {
  AnalyzeFrameResult,
  AnalyzeMode,
  EnrollmentCapture,
  MatchCandidate,
  MatchResult,
  RecognitionLogInput,
  WorkerRequest,
  WorkerResponse,
} from './types';

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
};

const CANDIDATES_CACHE_MS = 30_000;

/**
 * Fachada del motor biométrico para UI.
 * Preferencia: Web Worker; fallback: hilo principal (async).
 */
export class InsightFaceService {
  private worker: Worker | null = null;
  private engine: InsightFaceEngine | null = null;
  private useWorker = true;
  private ready = false;
  private pending = new Map<string, Pending>();
  private initPromise: Promise<void> | null = null;
  private candidatesCache: { at: number; list: MatchCandidate[] } | null = null;

  async initialize(): Promise<void> {
    if (this.ready) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const base = RECOGNITION_CONFIG.MODEL_BASE_URL;
    const detectionUrl = `${base}/${RECOGNITION_CONFIG.DETECTION_MODEL_FILE}`;
    const recognitionUrl = `${base}/${RECOGNITION_CONFIG.RECOGNITION_MODEL_FILE}`;

    try {
      await this.initWorker(detectionUrl, recognitionUrl);
      this.useWorker = true;
      this.ready = true;
      console.info('[InsightFaceService] listo (Web Worker)');
    } catch (workerErr) {
      console.warn('[InsightFaceService] Worker falló, usando main thread', workerErr);
      this.useWorker = false;
      this.engine = new InsightFaceEngine();
      await this.engine.init(detectionUrl, recognitionUrl);
      this.ready = true;
      console.info('[InsightFaceService] listo (main thread)');
    }
  }

  private initWorker(detectionUrl: string, recognitionUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(
          new URL('./worker/faceRecognition.worker.ts', import.meta.url),
          { type: 'module' },
        );
        this.worker = worker;
        worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
          const msg = ev.data;
          if (msg.type === 'ready') {
            const p = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            p?.resolve(undefined);
            return;
          }
          const p = this.pending.get(msg.id);
          if (!p) return;
          this.pending.delete(msg.id);
          if (msg.type === 'error') p.reject(new Error(msg.message));
          else p.resolve(msg.payload);
        };
        worker.onerror = (err) => {
          reject(new Error(err.message || 'Worker error'));
        };

        const id = crypto.randomUUID();
        this.pending.set(id, {
          resolve: () => resolve(),
          reject,
        });
        const req: WorkerRequest = { id, type: 'init', detectionUrl, recognitionUrl };
        worker.postMessage(req);

        setTimeout(() => {
          if (this.pending.has(id)) {
            this.pending.delete(id);
            reject(new Error('Timeout iniciando worker biométrico'));
          }
        }, 60_000);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  get isReady(): boolean {
    return this.ready;
  }

  async analyzeVideoFrame(
    video: HTMLVideoElement,
    mode: AnalyzeMode = 'match',
  ): Promise<AnalyzeFrameResult> {
    await this.initialize();
    const imageData = videoFrameToImageData(video);
    return this.analyzeImageData(imageData, mode);
  }

  async analyzeImageData(
    imageData: ImageData,
    mode: AnalyzeMode = 'match',
  ): Promise<AnalyzeFrameResult> {
    await this.initialize();
    if (this.useWorker && this.worker) {
      return this.analyzeViaWorker(imageData, mode);
    }
    if (!this.engine) throw new Error('Motor no inicializado');
    return this.engine.analyze(imageData, mode);
  }

  private async analyzeViaWorker(
    imageData: ImageData,
    mode: AnalyzeMode = 'match',
  ): Promise<AnalyzeFrameResult> {
    const bitmap = await createImageBitmap(imageData);
    const id = crypto.randomUUID();
    const payload = await new Promise<AnalyzeFrameResult>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as AnalyzeFrameResult),
        reject,
      });
      const req: WorkerRequest = {
        id,
        type: 'analyze',
        imageBitmap: bitmap,
        width: imageData.width,
        height: imageData.height,
        mode,
      };
      this.worker!.postMessage(req, [bitmap]);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Timeout analizando frame'));
        }
      }, 15_000);
    });

    if (payload.embedding && !(payload.embedding.vector instanceof Float32Array)) {
      payload.embedding = {
        ...payload.embedding,
        vector: new Float32Array(payload.embedding.vector as unknown as number[]),
      };
    }
    return payload;
  }

  private async getCandidatesCached(): Promise<MatchCandidate[]> {
    if (this.candidatesCache && Date.now() - this.candidatesCache.at < CANDIDATES_CACHE_MS) {
      return this.candidatesCache.list;
    }
    const list = await faceEmbeddingRepository.listActiveCandidates();
    this.candidatesCache = { at: Date.now(), list };
    return list;
  }

  invalidateCandidatesCache(): void {
    this.candidatesCache = null;
  }

  /**
   * Identificación 1:N — compara el rostro contra todos los embeddings activos.
   * Usado en el flujo principal del kiosko (sin código de empleado).
   */
  async identifyEmployee(
    video: HTMLVideoElement,
  ): Promise<{ analysis: AnalyzeFrameResult; match: MatchResult | null }> {
    const started = performance.now();
    const analysis = await this.analyzeVideoFrame(video, 'match');

    if (analysis.rejectReason || !analysis.embedding) {
      const code =
        analysis.rejectReason?.includes('más de una')
          ? 'MULTI_FACE'
          : analysis.rejectReason?.includes('No se detectó')
            ? 'NO_FACE'
            : 'QUALITY_FAIL';
      await this.log({
        employee_id: null,
        result: code,
        reject_reason: analysis.rejectReason,
        duration_ms: Math.round(performance.now() - started),
      });
      return { analysis, match: null };
    }

    const candidates = await this.getCandidatesCached();
    if (candidates.length === 0) {
      await this.log({
        employee_id: null,
        result: 'REJECT',
        reject_reason: 'No hay biometrías registradas',
        duration_ms: Math.round(performance.now() - started),
      });
      return {
        analysis,
        match: {
          matched: false,
          employeeId: null,
          embeddingId: null,
          distance: Number.POSITIVE_INFINITY,
          confidence: 0,
          model: RECOGNITION_CONFIG.ACTIVE_MODEL,
        },
      };
    }

    const match = faceMatcher.matchBest(analysis.embedding.vector, candidates);
    await this.log({
      employee_id: match.employeeId,
      result: match.matched ? 'MATCH' : 'REJECT',
      confidence: match.confidence,
      distance: Number.isFinite(match.distance) ? match.distance : null,
      reject_reason: match.matched ? null : 'Rostro no reconocido',
      duration_ms: Math.round(performance.now() - started),
      model: match.model,
    });

    return { analysis, match };
  }

  async verifyEmployee(
    video: HTMLVideoElement,
    employeeId: string,
  ): Promise<{ analysis: AnalyzeFrameResult; match: MatchResult | null }> {
    const started = performance.now();
    const analysis = await this.analyzeVideoFrame(video, 'match');

    if (analysis.rejectReason || !analysis.embedding) {
      const code =
        analysis.rejectReason?.includes('más de una')
          ? 'MULTI_FACE'
          : analysis.rejectReason?.includes('No se detectó')
            ? 'NO_FACE'
            : 'QUALITY_FAIL';
      await this.log({
        employee_id: employeeId,
        result: code,
        reject_reason: analysis.rejectReason,
        duration_ms: Math.round(performance.now() - started),
      });
      return { analysis, match: null };
    }

    const stored = await faceEmbeddingRepository.listActiveForEmployee(employeeId);
    const candidates = stored.map((row) => ({
      employeeId: row.employee_id,
      embeddingId: row.id,
      vector: row.embedding,
    }));

    const match = faceMatcher.matchBest(analysis.embedding.vector, candidates);
    await this.log({
      employee_id: employeeId,
      result: match.matched ? 'MATCH' : 'REJECT',
      confidence: match.confidence,
      distance: Number.isFinite(match.distance) ? match.distance : null,
      reject_reason: match.matched ? null : 'Rostro no coincide con el empleado',
      duration_ms: Math.round(performance.now() - started),
      model: match.model,
    });

    return { analysis, match };
  }

  async captureForEnrollment(
    video: HTMLVideoElement,
    pose: string,
  ): Promise<EnrollmentCapture | { error: string; quality?: number }> {
    const analysis = await this.analyzeVideoFrame(video, 'enroll');
    if (!analysis.embedding || !analysis.quality.passed) {
      return {
        error:
          analysis.rejectReason ??
          `Calidad insuficiente (${analysis.quality.score}/${thresholdManager.minQualityScore})`,
        quality: analysis.quality.score,
      };
    }
    const m = analysis.quality.metrics;
    return {
      pose,
      embedding: Array.from(analysis.embedding.vector),
      quality: analysis.quality.score,
      brightness: m.brightness,
      sharpness: m.sharpness,
      contrast: m.contrast,
      faceSize: m.faceSize,
      tilt: m.tilt,
      model: analysis.embedding.model,
    };
  }

  async findDuplicateEmployee(
    probe: ArrayLike<number>,
    excludeEmployeeId?: string,
  ): Promise<{ employeeId: string; distance: number } | null> {
    const candidates = await faceEmbeddingRepository.listActiveCandidates();
    const filtered = excludeEmployeeId
      ? candidates.filter((c) => c.employeeId !== excludeEmployeeId)
      : candidates;
    const match = faceMatcher.matchBest(probe, filtered);
    if (match.distance <= thresholdManager.duplicateMaxDistance && match.employeeId) {
      return { employeeId: match.employeeId, distance: match.distance };
    }
    return null;
  }

  async saveEnrollment(employeeId: string, captures: EnrollmentCapture[]): Promise<boolean> {
    if (captures.length < thresholdManager.minEnrollmentCount) {
      console.error('[InsightFaceService] capturas insuficientes', captures.length);
      return false;
    }
    // RPC kiosk_enroll_face_embeddings ya desactiva embeddings previos del modelo
    const ok = await faceEmbeddingRepository.insertCaptures(
      employeeId,
      captures.slice(0, thresholdManager.maxEnrollmentCount),
    );
    if (ok) this.invalidateCandidatesCache();
    return ok;
  }

  async hasBiometrics(employeeId: string): Promise<boolean> {
    const count = await faceEmbeddingRepository.countActiveForEmployee(employeeId);
    return count > 0;
  }

  async log(input: RecognitionLogInput): Promise<void> {
    await faceEmbeddingRepository.logRecognition(input);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.engine = null;
    this.ready = false;
    this.initPromise = null;
    this.pending.clear();
  }
}

let singleton: InsightFaceService | null = null;

export function getInsightFaceService(): InsightFaceService {
  if (!singleton) singleton = new InsightFaceService();
  return singleton;
}
