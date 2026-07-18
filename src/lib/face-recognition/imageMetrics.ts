import type { DetectedFace, ImageQualityMetrics } from './types';
import { RECOGNITION_CONFIG } from '@/config/recognition';

/**
 * Extrae métricas de calidad a partir de ImageData y rostros detectados.
 * Con rostro detectado, brillo/contraste/nitidez se miden en la región facial
 * (evita falsos rechazos por contraluz de ventanas detrás del usuario).
 */
export function computeImageQualityMetrics(
  imageData: ImageData,
  faces: DetectedFace[],
): ImageQualityMetrics {
  const { data, width, height } = imageData;
  const primary = faces[0];

  // Submuestreo para rendimiento en tablet
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 80_000)));

  let region = { x0: 0, y0: 0, x1: width, y1: height };
  if (primary) {
    const pad = 0.15;
    const bx = primary.box.x;
    const by = primary.box.y;
    const bw = primary.box.width;
    const bh = primary.box.height;
    region = {
      x0: Math.max(0, Math.floor(bx - bw * pad)),
      y0: Math.max(0, Math.floor(by - bh * pad)),
      x1: Math.min(width, Math.ceil(bx + bw * (1 + pad))),
      y1: Math.min(height, Math.ceil(by + bh * (1 + pad))),
    };
  }

  let sum = 0;
  let sumSq = 0;
  let n = 0;

  for (let y = region.y0; y < region.y1; y += step) {
    for (let x = region.x0; x < region.x1; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += lum;
      sumSq += lum * lum;
      n++;
    }
  }

  const brightness = n ? sum / n : 0;
  const variance = n ? Math.max(0, sumSq / n - brightness * brightness) : 0;
  const contrast = Math.sqrt(variance);

  const sharpness = estimateSharpness(data, width, height, step, region);
  const faceSize = primary ? Math.min(primary.box.width, primary.box.height) : 0;
  const tilt = primary ? estimateTilt(primary) : 0;
  const centered = primary
    ? isFaceCentered(primary, width, height, RECOGNITION_CONFIG.FACE_CENTER_TOLERANCE)
    : false;

  return {
    brightness,
    sharpness,
    contrast,
    faceSize,
    tilt,
    faceCount: faces.length,
    centered,
  };
}

function estimateSharpness(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  step: number,
  region: { x0: number; y0: number; x1: number; y1: number },
): number {
  let laplacianAcc = 0;
  let count = 0;
  const y0 = Math.max(region.y0, step);
  const y1 = Math.min(region.y1, height - step);
  const x0 = Math.max(region.x0, step);
  const x1 = Math.min(region.x1, width - step);

  for (let y = y0; y < y1; y += step * 2) {
    for (let x = x0; x < x1; x += step * 2) {
      const c = lumaAt(data, width, x, y);
      const l = lumaAt(data, width, x - step, y);
      const r = lumaAt(data, width, x + step, y);
      const u = lumaAt(data, width, x, y - step);
      const d = lumaAt(data, width, x, y + step);
      const lap = Math.abs(4 * c - l - r - u - d);
      laplacianAcc += lap;
      count++;
    }
  }
  return count ? laplacianAcc / count : 0;
}

function lumaAt(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  const i = (y * width + x) * 4;
  return 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
}

function isFaceCentered(
  face: DetectedFace,
  imgW: number,
  imgH: number,
  tolerance: number,
): boolean {
  const cx = face.box.x + face.box.width / 2;
  const cy = face.box.y + face.box.height / 2;
  const dx = Math.abs(cx / imgW - 0.5);
  const dy = Math.abs(cy / imgH - 0.5);
  return dx <= tolerance && dy <= tolerance;
}

/** Estimación grosera de inclinación a partir del aspect ratio del bbox. */
function estimateTilt(face: DetectedFace): number {
  const ratio = face.box.width / Math.max(1, face.box.height);
  // Ratio ideal ~0.75–1.1; desviación → grados aproximados
  const deviation = Math.abs(ratio - 0.9);
  return Math.min(45, deviation * 40);
}
