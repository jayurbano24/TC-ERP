/// <reference lib="webworker" />

import * as ort from 'onnxruntime-web';
import { InsightFaceEngine } from '../InsightFaceEngine';
import { imageBitmapToImageData } from '../preprocess';
import type { WorkerRequest, WorkerResponse } from '../types';

declare const self: DedicatedWorkerGlobalScope;

ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;
ort.env.wasm.wasmPaths = '/onnx/';

const engine = new InsightFaceEngine();

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      await engine.init(msg.detectionUrl, msg.recognitionUrl);
      const res: WorkerResponse = { id: msg.id, type: 'ready' };
      self.postMessage(res);
      return;
    }

    if (msg.type === 'analyze') {
      const imageData = imageBitmapToImageData(msg.imageBitmap);
      msg.imageBitmap.close();
      const payload = await engine.analyze(imageData, msg.mode ?? 'match');
      // Float32Array no se clona bien a veces; serializar embedding
      const serializable = {
        ...payload,
        embedding: payload.embedding
          ? {
              model: payload.embedding.model,
              vector: Array.from(payload.embedding.vector),
            }
          : null,
      };
      const res: WorkerResponse = {
        id: msg.id,
        type: 'result',
        payload: {
          ...serializable,
          embedding: serializable.embedding
            ? {
                model: serializable.embedding.model,
                vector: new Float32Array(serializable.embedding.vector),
              }
            : null,
        },
      };
      self.postMessage(res);
      return;
    }
  } catch (err) {
    const res: WorkerResponse = {
      id: msg.id,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(res);
  }
};

export {};
