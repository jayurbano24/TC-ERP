import * as ort from 'onnxruntime-web';
import { RECOGNITION_CONFIG } from '@/config/recognition';
import { letterboxRgb } from './preprocess';
import type { DetectedFace } from './types';

type Anchor = { cx: number; cy: number; stride: number };

/**
 * Detector SCRFD (ONNX) — pack buffalo_sc / det_500m.
 */
export class FaceDetector {
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

  async detect(imageData: ImageData): Promise<DetectedFace[]> {
    if (!this.session) throw new Error('FaceDetector no inicializado');

    const size = RECOGNITION_CONFIG.DET_INPUT_SIZE;
    const { tensor, scale, padX, padY } = letterboxRgb(imageData, size);
    const input = new ort.Tensor('float32', tensor, [1, 3, size, size]);
    const outputs = await this.session.run({ [this.inputName]: input });

    const faces = decodeScrfd(outputs, size, RECOGNITION_CONFIG.DETECTION_SCORE_MIN);
    return faces
      .map((f) => ({
        box: {
          x: (f.box.x - padX) / scale,
          y: (f.box.y - padY) / scale,
          width: f.box.width / scale,
          height: f.box.height / scale,
          score: f.box.score,
        },
      }))
      .filter(
        (f) =>
          f.box.width > 1 &&
          f.box.height > 1 &&
          f.box.x + f.box.width > 0 &&
          f.box.y + f.box.height > 0,
      )
      .sort((a, b) => b.box.score - a.box.score);
  }
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function decodeScrfd(
  outputs: Record<string, ort.Tensor>,
  inputSize: number,
  scoreThresh: number,
): DetectedFace[] {
  const strides = [8, 16, 32];
  const names = Object.keys(outputs);
  const byLen = (t: ort.Tensor) => {
    const dataLen = t.data.length;
    const last = t.dims[t.dims.length - 1] ?? 1;
    return { t, dataLen, last, channels: last };
  };

  const scoreTensors: ort.Tensor[] = [];
  const bboxTensors: ort.Tensor[] = [];

  for (const name of names) {
    const meta = byLen(outputs[name]!);
    if (meta.channels === 1) scoreTensors.push(meta.t);
    else if (meta.channels === 4) bboxTensors.push(meta.t);
    // channels === 10 → keypoints (buffalo_s); se ignoran en buffalo_sc / crop
  }

  // Ordenar por cantidad de anchors (stride 8 > 16 > 32)
  const sortByAnchors = (arr: ort.Tensor[]) =>
    [...arr].sort((a, b) => b.data.length - a.data.length);
  const scoresSorted = sortByAnchors(scoreTensors).slice(0, 3);
  const bboxesSorted = sortByAnchors(bboxTensors).slice(0, 3);

  // Fallback: orden de aparición [s8,s16,s32,b8,b16,b32,...]
  if (scoresSorted.length < 3 || bboxesSorted.length < 3) {
    const vals = names.map((n) => outputs[n]!);
    scoresSorted.length = 0;
    bboxesSorted.length = 0;
    if (vals.length >= 6) {
      scoresSorted.push(vals[0]!, vals[1]!, vals[2]!);
      bboxesSorted.push(vals[3]!, vals[4]!, vals[5]!);
    }
  }

  const faces: DetectedFace[] = [];
  for (let i = 0; i < strides.length; i++) {
    const stride = strides[i]!;
    const scores = scoresSorted[i];
    const bboxes = bboxesSorted[i];
    if (!scores || !bboxes) continue;

    const scoreData = scores.data as Float32Array;
    const bboxData = bboxes.data as Float32Array;
    const anchors = generateAnchors(inputSize, stride);
    const num = Math.min(anchors.length, scoreData.length, Math.floor(bboxData.length / 4));

    for (let j = 0; j < num; j++) {
      const raw = scoreData[j]!;
      const score = raw > 1 || raw < 0 ? sigmoid(raw) : raw;
      if (score < scoreThresh) continue;
      const a = anchors[j]!;
      const ox = bboxData[j * 4]!;
      const oy = bboxData[j * 4 + 1]!;
      const ow = bboxData[j * 4 + 2]!;
      const oh = bboxData[j * 4 + 3]!;
      const x1 = a.cx - ox * stride;
      const y1 = a.cy - oy * stride;
      const x2 = a.cx + ow * stride;
      const y2 = a.cy + oh * stride;
      faces.push({
        box: {
          x: x1,
          y: y1,
          width: x2 - x1,
          height: y2 - y1,
          score,
        },
      });
    }
  }

  return nms(faces, 0.4).slice(0, 20);
}

function generateAnchors(inputSize: number, stride: number): Anchor[] {
  const anchors: Anchor[] = [];
  const feat = Math.floor(inputSize / stride);
  // SCRFD usa 2 anchors por celda
  for (let y = 0; y < feat; y++) {
    for (let x = 0; x < feat; x++) {
      const cx = (x + 0.5) * stride;
      const cy = (y + 0.5) * stride;
      anchors.push({ cx, cy, stride });
      anchors.push({ cx, cy, stride });
    }
  }
  return anchors;
}

function nms(faces: DetectedFace[], iouThresh: number): DetectedFace[] {
  const sorted = [...faces].sort((a, b) => b.box.score - a.box.score);
  const keep: DetectedFace[] = [];
  const suppressed = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;
    const a = sorted[i]!;
    keep.push(a);
    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue;
      if (iou(a, sorted[j]!) >= iouThresh) suppressed.add(j);
    }
  }
  return keep;
}

function iou(a: DetectedFace, b: DetectedFace): number {
  const ax2 = a.box.x + a.box.width;
  const ay2 = a.box.y + a.box.height;
  const bx2 = b.box.x + b.box.width;
  const by2 = b.box.y + b.box.height;
  const ix1 = Math.max(a.box.x, b.box.x);
  const iy1 = Math.max(a.box.y, b.box.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const uni = a.box.width * a.box.height + b.box.width * b.box.height - inter;
  return uni <= 0 ? 0 : inter / uni;
}
