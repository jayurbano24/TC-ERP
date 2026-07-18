/**
 * Parámetros centralizados del motor biométrico InsightFace (ArcFace).
 * No hardcodear umbrales en UI ni en servicios.
 */

export const RECOGNITION_CONFIG = {
  /** Versión exacta del motor activo (debe coincidir con filas `model`). */
  ACTIVE_MODEL: 'ArcFace-Buffalo-SC' as const,

  EMBEDDING_DIM: 512,

  /** Capturas válidas requeridas en enrolamiento. */
  MIN_ENROLLMENT_COUNT: 15,
  MAX_ENROLLMENT_COUNT: 20,

  /** Score 0–100; por debajo no se persiste el embedding (enrolamiento). */
  MIN_QUALITY_SCORE: 80,
  /** Marcaje 1:N / 1:1: umbral más permisivo (kiosko con iluminación variable). */
  MIN_QUALITY_SCORE_MATCH: 62,

  /** Detección / geometría */
  MIN_FACE_SIZE: 96,
  MAX_FACES: 1,
  DETECTION_SCORE_MIN: 0.45,
  FACE_CENTER_TOLERANCE: 0.36,
  MAX_TILT_DEG: 28,

  /** Calidad de imagen (región facial; tolera contraluz moderado) */
  MIN_BRIGHTNESS: 28,
  MAX_BRIGHTNESS: 235,
  MIN_SHARPNESS: 8,
  MIN_CONTRAST: 18,

  /**
   * Distancia euclidiana L2 entre embeddings L2-normalizados.
   * Equivale a sqrt(2 - 2*cosine). Umbral típico ArcFace ~0.4–0.7 en kiosko.
   * La decisión de match usa SOLO distancia; MIN_CONFIDENCE es para UI.
   */
  MAX_DISTANCE: 0.68,
  /** Confianza mostrada cuando distance == MAX_DISTANCE (antes era inconsistente: 33% vs 70%). */
  MIN_CONFIDENCE: 70,

  /** Anti-duplicado entre empleados distintos. */
  DUPLICATE_MAX_DISTANCE: 0.45,

  /** Paths públicos de modelos ONNX (buffalo_sc). */
  MODEL_BASE_URL: '/models/insightface',
  DETECTION_MODEL_FILE: 'det_500m.onnx',
  RECOGNITION_MODEL_FILE: 'w600k_mbf.onnx',

  /** Intervalo de muestreo en kiosco (ms). */
  FRAME_INTERVAL_MS: 350,

  /** Input detector SCRFD. */
  DET_INPUT_SIZE: 640,
} as const;

export type RecognitionModelId = typeof RECOGNITION_CONFIG.ACTIVE_MODEL;

export const ENROLLMENT_POSES = [
  'FRONT',
  'FRONT',
  'LEFT',
  'RIGHT',
  'UP',
  'DOWN',
  'NEUTRAL',
  'SMILE',
  'LIGHT_VAR_1',
  'LIGHT_VAR_2',
  'DISTANCE_NEAR',
  'DISTANCE_FAR',
  'LEFT',
  'RIGHT',
  'FRONT',
  'NEUTRAL',
  'SMILE',
  'UP',
  'DOWN',
  'FRONT',
] as const;

export type EnrollmentPose = (typeof ENROLLMENT_POSES)[number];

export const POSE_INSTRUCTIONS: Record<string, string> = {
  FRONT: 'Mire de frente a la cámara',
  LEFT: 'Gire ligeramente el rostro a la izquierda',
  RIGHT: 'Gire ligeramente el rostro a la derecha',
  UP: 'Incline la mirada hacia arriba',
  DOWN: 'Incline la mirada hacia abajo',
  NEUTRAL: 'Expresión neutra, sin sonreír',
  SMILE: 'Sonría de forma natural',
  LIGHT_VAR_1: 'Mantenga el rostro; varíe ligeramente la iluminación',
  LIGHT_VAR_2: 'Acerque o aleje una fuente de luz si es posible',
  DISTANCE_NEAR: 'Acérquese un poco a la cámara',
  DISTANCE_FAR: 'Aléjese un poco de la cámara',
};
