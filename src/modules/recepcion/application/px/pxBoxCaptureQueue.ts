/** Cola serializada por box_id: un RPC capture in-flight por caja. */

export type PxBoxCaptureQueueEntry<T> = {
  requestId: string;
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

export type PxBoxQueueSnapshot = {
  boxId: string;
  pending: number;
  processing: boolean;
};

const queues = new Map<string, PxBoxCaptureQueueEntry<unknown>[]>();
const processing = new Set<string>();

export const PX_BOX_BUSY_RETRY_DELAY_MS = 400;
export const PX_BOX_BUSY_MAX_RETRIES = 2;

/** Desactivar con NEXT_PUBLIC_PX_BOX_QUEUE=false */
export function isPxBoxQueueEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PX_BOX_QUEUE !== 'false';
}

export function isPxBoxBusyMessage(message: string): boolean {
  return /BOX_BUSY|otra captura en proceso/i.test(message);
}

export function isPxCaptureTimeoutMessage(message: string): boolean {
  return /captura tardó demasiado|statement timeout|57014|query_canceled/i.test(message);
}

export function isPxNetworkCaptureError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    return /failed to fetch|networkerror|load failed/i.test(err.message);
  }
  return false;
}

export function getPxBoxQueueSnapshot(boxId: string): PxBoxQueueSnapshot {
  return {
    boxId,
    pending: queues.get(boxId)?.length ?? 0,
    processing: processing.has(boxId),
  };
}

export function resetPxBoxCaptureQueuesForTests(): void {
  queues.clear();
  processing.clear();
}

async function drainBoxQueue(boxId: string): Promise<void> {
  if (processing.has(boxId)) return;

  processing.add(boxId);
  try {
    for (;;) {
      const queue = queues.get(boxId);
      if (!queue?.length) break;

      const entry = queue.shift() as PxBoxCaptureQueueEntry<unknown>;
      try {
        const result = await entry.task();
        entry.resolve(result);
      } catch (error) {
        entry.reject(error);
      }
    }
  } finally {
    processing.delete(boxId);
    if (queues.get(boxId)?.length) {
      void drainBoxQueue(boxId);
    }
  }
}

/**
 * Encola captura para una caja. Diferentes box_id procesan en paralelo.
 * Misma caja: FIFO, 1 task activo.
 */
export function enqueuePxBoxCapture<T>(boxId: string, task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const entry: PxBoxCaptureQueueEntry<T> = {
      requestId: crypto.randomUUID(),
      task,
      resolve,
      reject,
    };

    const bucket = queues.get(boxId) ?? [];
    bucket.push(entry as PxBoxCaptureQueueEntry<unknown>);
    queues.set(boxId, bucket);

    void drainBoxQueue(boxId);
  });
}

export async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
