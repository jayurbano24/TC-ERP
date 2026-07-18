import type { DetectedFace } from './types';

/** Letterbox resize manteniendo aspect ratio (estilo InsightFace/YOLO). */
export function letterboxRgb(
  source: ImageData,
  targetSize: number,
): { tensor: Float32Array; scale: number; padX: number; padY: number } {
  const { width: sw, height: sh, data } = source;
  const scale = Math.min(targetSize / sw, targetSize / sh);
  const nw = Math.round(sw * scale);
  const nh = Math.round(sh * scale);
  const padX = Math.floor((targetSize - nw) / 2);
  const padY = Math.floor((targetSize - nh) / 2);

  const canvas = new OffscreenCanvas(targetSize, targetSize);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, targetSize, targetSize);

  const tmp = new OffscreenCanvas(sw, sh);
  const tctx = tmp.getContext('2d')!;
  tctx.putImageData(source, 0, 0);
  ctx.drawImage(tmp, 0, 0, sw, sh, padX, padY, nw, nh);

  const out = ctx.getImageData(0, 0, targetSize, targetSize);
  const tensor = new Float32Array(3 * targetSize * targetSize);
  const plane = targetSize * targetSize;
  // InsightFace SCRFD: (pixel - 127.5) / 128.0
  for (let i = 0; i < plane; i++) {
    tensor[i] = (out.data[i * 4]! - 127.5) / 128;
    tensor[plane + i] = (out.data[i * 4 + 1]! - 127.5) / 128;
    tensor[2 * plane + i] = (out.data[i * 4 + 2]! - 127.5) / 128;
  }
  return { tensor, scale, padX, padY };
}

/** Recorte de rostro con margen → 112×112 NCHW normalizado ArcFace. */
export function cropFaceToArcFaceTensor(
  source: ImageData,
  face: DetectedFace,
  outSize = 112,
  margin = 0.2,
): Float32Array {
  const { box } = face;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const side = Math.max(box.width, box.height) * (1 + margin);
  const x0 = Math.max(0, Math.floor(cx - side / 2));
  const y0 = Math.max(0, Math.floor(cy - side / 2));
  const x1 = Math.min(source.width, Math.ceil(cx + side / 2));
  const y1 = Math.min(source.height, Math.ceil(cy + side / 2));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);

  const srcCanvas = new OffscreenCanvas(source.width, source.height);
  const sctx = srcCanvas.getContext('2d')!;
  sctx.putImageData(source, 0, 0);

  const outCanvas = new OffscreenCanvas(outSize, outSize);
  const octx = outCanvas.getContext('2d')!;
  octx.drawImage(srcCanvas, x0, y0, w, h, 0, 0, outSize, outSize);
  const img = octx.getImageData(0, 0, outSize, outSize);

  const tensor = new Float32Array(3 * outSize * outSize);
  const plane = outSize * outSize;
  for (let i = 0; i < plane; i++) {
    tensor[i] = (img.data[i * 4]! - 127.5) / 127.5;
    tensor[plane + i] = (img.data[i * 4 + 1]! - 127.5) / 127.5;
    tensor[2 * plane + i] = (img.data[i * 4 + 2]! - 127.5) / 127.5;
  }
  return tensor;
}

export function l2Normalize(vector: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) norm += vector[i]! * vector[i]!;
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i]! / norm;
  return out;
}

export function imageBitmapToImageData(bitmap: ImageBitmap): ImageData {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

export function videoFrameToImageData(video: HTMLVideoElement): ImageData {
  const w = video.videoWidth;
  const h = video.videoHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
