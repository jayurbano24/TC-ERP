/** Trazabilidad end-to-end de un scan PX (Fase 4). */

export type PxCaptureRequestContext = {
  requestId: string;
  clientEnqueuedAt: number;
};

export function createPxCaptureRequestContext(
  requestId: string = crypto.randomUUID(),
): PxCaptureRequestContext {
  return {
    requestId,
    clientEnqueuedAt: Date.now(),
  };
}

export function computePxClientDurationMs(
  clientEnqueuedAt: number | undefined | null,
  finishedAt: number = Date.now(),
): number | null {
  if (clientEnqueuedAt == null || !Number.isFinite(clientEnqueuedAt)) return null;
  const delta = finishedAt - clientEnqueuedAt;
  return delta >= 0 ? delta : null;
}

export function isPxCaptureRequestId(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
