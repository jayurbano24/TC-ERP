import type { EnrollmentPose } from '@/config/recognition';

export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
};

export type DetectedFace = {
  box: FaceBox;
  /** Landmarks opcionales [x,y]×5 si el detector los aporta. */
  landmarks?: Array<{ x: number; y: number }>;
};

export type ImageQualityMetrics = {
  brightness: number;
  sharpness: number;
  contrast: number;
  faceSize: number;
  tilt: number;
  faceCount: number;
  centered: boolean;
};

export type QualityGateResult = {
  ok: boolean;
  reason?: string;
  metrics: ImageQualityMetrics;
};

export type FaceQualityScoreResult = {
  score: number;
  metrics: ImageQualityMetrics;
  reasons: string[];
  passed: boolean;
};

export type FaceEmbedding = {
  vector: Float32Array;
  model: string;
};

export type StoredFaceEmbedding = {
  id: string;
  employee_id: string;
  embedding: number[];
  pose: string;
  quality: number;
  brightness: number | null;
  sharpness: number | null;
  contrast: number | null;
  face_size: number | null;
  tilt: number | null;
  model: string;
  created_at: string;
  active: boolean;
};

export type MatchCandidate = {
  employeeId: string;
  embeddingId?: string;
  vector: Float32Array | number[];
};

export type MatchResult = {
  matched: boolean;
  employeeId: string | null;
  embeddingId: string | null;
  distance: number;
  confidence: number;
  model: string;
};

export type RecognitionResultCode =
  | 'MATCH'
  | 'REJECT'
  | 'QUALITY_FAIL'
  | 'NO_FACE'
  | 'MULTI_FACE'
  | 'ERROR';

export type RecognitionLogInput = {
  employee_id?: string | null;
  result: RecognitionResultCode;
  confidence?: number | null;
  distance?: number | null;
  duration_ms?: number | null;
  tablet_id?: string | null;
  reject_reason?: string | null;
  model?: string | null;
};

export type AnalyzeFrameResult = {
  faces: DetectedFace[];
  quality: FaceQualityScoreResult;
  embedding: FaceEmbedding | null;
  rejectReason?: string;
};

export type EnrollmentCapture = {
  pose: EnrollmentPose | string;
  embedding: number[];
  quality: number;
  brightness: number;
  sharpness: number;
  contrast: number;
  faceSize: number;
  tilt: number;
  model: string;
};

export type AnalyzeMode = 'match' | 'enroll';

export type WorkerRequest =
  | { id: string; type: 'init'; detectionUrl: string; recognitionUrl: string }
  | {
      id: string;
      type: 'analyze';
      imageBitmap: ImageBitmap;
      width: number;
      height: number;
      mode?: AnalyzeMode;
    };

export type WorkerResponse =
  | { id: string; type: 'ready' }
  | { id: string; type: 'result'; payload: AnalyzeFrameResult }
  | { id: string; type: 'error'; message: string };
